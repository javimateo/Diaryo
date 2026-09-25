use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::desk_layer::{self, DeskLayer};
use crate::state::{info, update_settings, Desktop};
use crate::window;

/// Los dos atajos globales: el del diario flotante y el de la mesa en el escritorio.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Hotkey {
    Widget,
    Desk,
}

/// Pone un atajo global (y quita el anterior). Si ya lo usa otra app, deja el de antes.
pub fn register(app: &AppHandle, hotkey: Hotkey, accel: &str) -> Result<(), String> {
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

/// Se ha pulsado un atajo global: el de la mesa la enseña o la esconde; el otro, el
/// diario flotante.
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

/// El atajo de la mesa: la enseña o la esconde (y se queda así la próxima vez).
fn toggle_desk_layer(app: &AppHandle) {
    let enabled = !app.state::<DeskLayer>().enabled();
    update_settings(app, |settings| settings.desk_layer = enabled);
    desk_layer::set_enabled(app, enabled);
    let _ = app.emit_to("main", "diaryo://info", info(app));
}
