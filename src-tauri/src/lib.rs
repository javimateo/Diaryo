mod backup;
mod commands;
mod desk_layer;
mod settings;
mod shortcuts;
mod state;
mod texts;
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
    // When starting with Windows it opens hidden, ready for the shortcut.
    let hidden = std::env::args().any(|arg| arg == "--hidden");

    tauri::Builder::default()
        // If diaryo was already open (in the tray, for example), that one is shown.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show(app, Mode::Window);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Updates from the GitHub releases, signed (see the release workflow).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcuts::on_pressed)
                .build(),
        )
        .manage(Windowing::new(!hidden))
        .setup(move |app| {
            let handle = app.handle().clone();
            let mut settings = settings::load(&handle);
            // The first time, diaryo starts with Windows (then whatever is chosen in
            // Settings rules). Only in the installed build: development doesn't touch the
            // registry.
            if !settings.autostart_ready && !cfg!(debug_assertions) {
                let _ = handle.autolaunch().enable();
                settings.autostart_ready = true;
                settings::save(&handle, &settings);
            }
            let accel = settings.shortcut.clone();
            let desk_accel = settings.desk_shortcut.clone();
            app.manage(DeskLayer::new(settings.desk_layer));
            app.manage(Desktop::new(settings));
            // If another app already uses a shortcut, Settings says so to change it.
            let _ = shortcuts::register(&handle, Hotkey::Widget, &accel);
            let _ = shortcuts::register(&handle, Hotkey::Desk, &desk_accel);
            tray::build(&handle)?;
            // The desk on the desktop, behind the windows.
            desk_layer::create(&handle)?;
            desk_layer::refresh(&handle);
            if !hidden {
                window::reveal_later(&handle, Duration::from_secs(3));
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the window hides it: diaryo stays in the tray, ready for the
            // shortcut. The desktop desk doesn't close (it is removed with its shortcut
            // or in Settings).
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
            commands::write_copy_before_opening,
            commands::frontend_ready,
            commands::show_mode,
            commands::hide_window,
            commands::set_language,
            commands::quit_app,
            commands::open_sign_in,
            commands::open_website,
        ])
        .run(tauri::generate_context!())
        .expect("couldn't start diaryo");
}
