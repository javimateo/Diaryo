use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::state::lang;
use crate::window::{self, Mode};

/// The menu entries, to change their text when the language changes.
struct TrayItems {
    open: MenuItem<Wry>,
    widget: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// Icon next to the clock: click to open the diary; menu with the floating diary and
/// quit.
pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let texts = lang(app);
    let open = MenuItem::with_id(app, "open", texts.open_diary(), true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", texts.floating_diary(), true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", texts.quit(), true, None::<&str>)?;
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
    app.manage(TrayItems { open, widget, quit });
    Ok(())
}

/// Puts the menu in the current language.
pub fn update_texts(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let texts = lang(app);
    let _ = items.open.set_text(texts.open_diary());
    let _ = items.widget.set_text(texts.floating_diary());
    let _ = items.quit.set_text(texts.quit());
}

/// Quit: the page saves what is pending (and its backup) and replies with `quit_app`. If
/// it doesn't reply in time, it quits anyway.
fn request_quit(app: &AppHandle) {
    let _ = app.emit("diaryo://quit", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        app.exit(0);
    });
}
