mod backup;
mod desk_layer;
mod settings;
mod window;

use serde::Serialize;
use std::{sync::Mutex, time::Duration};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;

use desk_layer::DeskLayer;
use settings::Settings;
use window::{Mode, Windowing};

/// Los dos atajos globales: el del diario flotante y el de la mesa en el escritorio.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Hotkey {
    Widget,
    Desk,
}

/// Ajustes del escritorio y los atajos globales que están funcionando.
struct Desktop {
    settings: Mutex<Settings>,
    shortcuts: Mutex<[Option<Shortcut>; 2]>,
}

impl Desktop {
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
}

fn update_settings(app: &AppHandle, change: impl FnOnce(&mut Settings)) {
    let state = app.state::<Desktop>();
    let settings = {
        let mut settings = state.settings.lock().unwrap();
        change(&mut settings);
        settings.clone()
    };
    settings::save(app, &settings);
}

/// Pone un atajo global (y quita el anterior). Si ya lo usa otra app, deja el de antes.
fn register_shortcut(app: &AppHandle, hotkey: Hotkey, accel: &str) -> Result<(), String> {
    let shortcut: Shortcut = accel
        .parse()
        .map_err(|_| format!("«{accel}» no es un atajo válido"))?;
    let global = app.global_shortcut();
    let state = app.state::<Desktop>();
    let [widget, desk] = *state.shortcuts.lock().unwrap();
    let (previous, other) = match hotkey {
        Hotkey::Widget => (widget, desk),
        Hotkey::Desk => (desk, widget),
    };
    if previous == Some(shortcut) {
        return Ok(());
    }
    if other == Some(shortcut) {
        return Err(match hotkey {
            Hotkey::Widget => format!("{accel} ya es el atajo de la mesa en el escritorio"),
            Hotkey::Desk => format!("{accel} ya es el atajo del diario flotante"),
        });
    }
    if let Some(old) = previous {
        let _ = global.unregister(old);
    }
    match global.register(shortcut) {
        Ok(()) => {
            state.shortcuts.lock().unwrap()[hotkey as usize] = Some(shortcut);
            Ok(())
        }
        Err(_) => {
            if let Some(old) = previous {
                let _ = global.register(old);
            }
            Err(format!("{accel} ya lo usa otra aplicación"))
        }
    }
}

/// Lo que la página necesita saber de la parte de escritorio.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInfo {
    mode: Mode,
    shortcut: String,
    /// El atajo está funcionando (si no, otra app lo tiene cogido).
    shortcut_ok: bool,
    autostart: bool,
    backups: bool,
    backup_dir: String,
    /// La mesa en el escritorio de Windows.
    desk_layer: bool,
    desk_shortcut: String,
    desk_shortcut_ok: bool,
}

fn info(app: &AppHandle) -> DesktopInfo {
    let state = app.state::<Desktop>();
    let settings = state.settings();
    let [widget, desk] = *state.shortcuts.lock().unwrap();
    DesktopInfo {
        mode: app.state::<Windowing>().mode(),
        shortcut: settings.shortcut.clone(),
        shortcut_ok: widget.is_some(),
        desk_layer: app.state::<DeskLayer>().enabled(),
        desk_shortcut: settings.desk_shortcut.clone(),
        desk_shortcut_ok: desk.is_some(),
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
        backups: settings.backups,
        backup_dir: backup::dir(app, &settings)
            .map(|dir| dir.display().to_string())
            .unwrap_or_default(),
    }
}

#[tauri::command]
fn desktop_info(app: AppHandle) -> DesktopInfo {
    info(&app)
}

#[tauri::command]
fn set_shortcut(app: AppHandle, shortcut: String) -> Result<DesktopInfo, String> {
    register_shortcut(&app, Hotkey::Widget, &shortcut)?;
    update_settings(&app, |settings| settings.shortcut = shortcut);
    Ok(info(&app))
}

#[tauri::command]
fn set_desk_shortcut(app: AppHandle, shortcut: String) -> Result<DesktopInfo, String> {
    register_shortcut(&app, Hotkey::Desk, &shortcut)?;
    update_settings(&app, |settings| settings.desk_shortcut = shortcut);
    Ok(info(&app))
}

#[tauri::command]
fn set_desk_layer(app: AppHandle, enabled: bool) -> DesktopInfo {
    update_settings(&app, |settings| settings.desk_layer = enabled);
    desk_layer::set_enabled(&app, enabled);
    info(&app)
}

/// El atajo de la mesa: la enseña o la esconde (y se queda así la próxima vez).
fn toggle_desk_layer(app: &AppHandle) {
    let enabled = !app.state::<DeskLayer>().enabled();
    update_settings(app, |settings| settings.desk_layer = enabled);
    desk_layer::set_enabled(app, enabled);
    let _ = app.emit_to("main", "diaryo://info", info(app));
}

/// Dónde hay algo en la mesa del escritorio (ahí recibe el ratón).
#[tauri::command]
fn set_desk_areas(app: AppHandle, areas: Vec<desk_layer::Area>) {
    desk_layer::set_areas(&app, areas);
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<DesktopInfo, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| e.to_string())?;
    Ok(info(&app))
}

#[tauri::command]
fn set_backups(app: AppHandle, enabled: bool) -> DesktopInfo {
    update_settings(&app, |settings| settings.backups = enabled);
    info(&app)
}

#[tauri::command]
async fn choose_backup_dir(app: AppHandle) -> Result<DesktopInfo, String> {
    let current = backup::dir(&app, &app.state::<Desktop>().settings())?;
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Carpeta para las copias del diario");
    if current.exists() {
        dialog = dialog.set_directory(&current);
    }
    if let Some(window) = window::main_window(&app) {
        dialog = dialog.set_parent(&window);
    }
    if let Some(folder) = dialog.blocking_pick_folder() {
        let path = folder.into_path().map_err(|e| e.to_string())?;
        update_settings(&app, |settings| {
            settings.backup_dir = Some(path.display().to_string())
        });
    }
    Ok(info(&app))
}

#[tauri::command]
fn open_backup_dir(app: AppHandle) -> Result<(), String> {
    let dir = backup::dir(&app, &app.state::<Desktop>().settings())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Guarda la copia del día en la carpeta de las copias. Devuelve dónde.
#[tauri::command]
async fn write_backup(app: AppHandle, day: String, contents: String) -> Result<String, String> {
    let settings = app.state::<Desktop>().settings();
    if !settings.backups {
        return Err("Las copias automáticas están apagadas".into());
    }
    let dir = backup::dir(&app, &settings)?;
    backup::write(&dir, &day, &contents).map(|path| path.display().to_string())
}

/// La página ya tiene el aspecto que toca: se puede enseñar la ventana.
#[tauri::command]
fn frontend_ready(app: AppHandle) {
    window::reveal_if_pending(&app);
}

#[tauri::command]
fn show_mode(app: AppHandle, mode: Mode) {
    window::show(&app, mode);
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    window::hide_now(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Salir: la página guarda lo pendiente (y su copia) y contesta con `quit_app`. Si no
/// contesta a tiempo, se sale igual.
fn request_quit(app: &AppHandle) {
    let _ = app.emit("diaryo://quit", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        app.exit(0);
    });
}

/// Icono junto al reloj: clic para abrir el diario; menú con el diario flotante y salir.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir diaryo", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "Diario flotante", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &widget, &separator, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("diaryo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => window::show(app, Mode::Window),
            "widget" => window::show(app, Mode::Widget),
            "quit" => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::show(tray.app_handle(), Mode::Window);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Al arrancar con Windows se abre escondido, listo para el atajo.
    let hidden = std::env::args().any(|arg| arg == "--hidden");

    tauri::Builder::default()
        // Si diaryo ya estaba abierto (en la bandeja, por ejemplo), se enseña ese.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show(app, Mode::Window);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let shortcuts = app.state::<Desktop>().shortcuts.lock().unwrap().clone();
                    if shortcuts[Hotkey::Desk as usize] == Some(*shortcut) {
                        toggle_desk_layer(app);
                    } else {
                        window::toggle_widget(app);
                    }
                })
                .build(),
        )
        .manage(Windowing::new(!hidden))
        .setup(move |app| {
            let handle = app.handle().clone();
            let mut settings = settings::load(&handle);
            // La primera vez, diaryo arranca con Windows (luego manda lo que se elija en
            // Ajustes). Solo en la versión instalada: en desarrollo no se toca el registro.
            if !settings.autostart_ready && !cfg!(debug_assertions) {
                let _ = handle.autolaunch().enable();
                settings.autostart_ready = true;
                settings::save(&handle, &settings);
            }
            let accel = settings.shortcut.clone();
            let desk_accel = settings.desk_shortcut.clone();
            app.manage(DeskLayer::new(settings.desk_layer));
            app.manage(Desktop {
                settings: Mutex::new(settings),
                shortcuts: Mutex::new([None, None]),
            });
            // Si otra app ya usa un atajo, en Ajustes se avisa para cambiarlo.
            let _ = register_shortcut(&handle, Hotkey::Widget, &accel);
            let _ = register_shortcut(&handle, Hotkey::Desk, &desk_accel);
            build_tray(&handle)?;
            // La mesa en el escritorio, detrás de las ventanas.
            desk_layer::create(&handle)?;
            desk_layer::refresh(&handle);
            if !hidden {
                window::reveal_later(&handle, Duration::from_secs(3));
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Cerrar la ventana la esconde: diaryo sigue en la bandeja, listo para el atajo.
            // La mesa del escritorio no se cierra (se quita con su atajo o en Ajustes).
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if window.label() != desk_layer::LABEL {
                    window::hide(window.app_handle());
                }
            }
            WindowEvent::Focused(false) if window.label() != desk_layer::LABEL => {
                window::hide_widget_on_blur(window.app_handle())
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            set_shortcut,
            set_autostart,
            set_backups,
            set_desk_layer,
            set_desk_shortcut,
            set_desk_areas,
            choose_backup_dir,
            open_backup_dir,
            write_backup,
            frontend_ready,
            show_mode,
            hide_window,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("no se ha podido abrir diaryo");
}
