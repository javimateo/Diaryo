use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::desk_layer::{self, DeskLayer};
use crate::state::{info, lang, update_settings, Desktop};
use crate::window;

/// The two global shortcuts: the floating diary's and the desk on the desktop's.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Hotkey {
    Widget,
    Desk,
}

/// Sets a global shortcut (and removes the previous one). If another app already uses it,
/// keeps the old one.
pub fn register(app: &AppHandle, hotkey: Hotkey, accel: &str) -> Result<(), String> {
    let shortcut: Shortcut = accel
        .parse()
        .map_err(|_| lang(app).invalid_shortcut(accel))?;
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
            Hotkey::Widget => lang(app).shortcut_is_desk(accel),
            Hotkey::Desk => lang(app).shortcut_is_widget(accel),
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
            Err(lang(app).shortcut_taken(accel))
        }
    }
}

/// A global shortcut was pressed: the desk's shows or hides it; the other one, the
/// floating diary.
pub fn on_pressed(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let desk = app.state::<Desktop>().shortcuts.lock().unwrap()[Hotkey::Desk as usize];
    if desk == Some(*shortcut) {
        toggle_desk_layer(app);
    } else {
        window::toggle_widget(app);
    }
}

/// The desk shortcut: shows or hides it (and it stays that way next time).
fn toggle_desk_layer(app: &AppHandle) {
    let enabled = !app.state::<DeskLayer>().enabled();
    update_settings(app, |settings| settings.desk_layer = enabled);
    desk_layer::set_enabled(app, enabled);
    let _ = app.emit_to("main", "diaryo://info", info(app));
}
