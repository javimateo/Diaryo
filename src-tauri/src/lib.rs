mod backup;
mod commands;
mod desk_layer;
mod settings;
mod shortcuts;
mod state;
mod tray;
mod window;

use std::time::Duration;
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use desk_layer::DeskLayer;
use shortcuts::Hotkey;
use state::Desktop;
use window::{Mode, Windowing};

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
                .with_handler(shortcuts::on_pressed)
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
            app.manage(Desktop::new(settings));
            // Si otra app ya usa un atajo, en Ajustes se avisa para cambiarlo.
            let _ = shortcuts::register(&handle, Hotkey::Widget, &accel);
            let _ = shortcuts::register(&handle, Hotkey::Desk, &desk_accel);
            tray::build(&handle)?;
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
            commands::desktop_info,
            commands::set_shortcut,
            commands::set_autostart,
            commands::set_backups,
            commands::set_desk_layer,
            commands::set_desk_shortcut,
            commands::set_desk_areas,
            commands::choose_backup_dir,
            commands::open_backup_dir,
            commands::write_backup,
            commands::frontend_ready,
            commands::show_mode,
            commands::hide_window,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("no se ha podido abrir diaryo");
}
