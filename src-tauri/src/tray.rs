use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter,
};

use crate::window::{self, Mode};

/// Icono junto al reloj: clic para abrir el diario; menú con el diario flotante y salir.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
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
