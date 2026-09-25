use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::Shortcut;

use crate::backup;
use crate::desk_layer::DeskLayer;
use crate::settings::{self, Settings};
use crate::window::{Mode, Windowing};

/// Ajustes del escritorio y los atajos globales que están funcionando (el del diario
/// flotante y el de la mesa en el escritorio; None si otra app lo tiene cogido).
pub struct Desktop {
    settings: Mutex<Settings>,
    pub shortcuts: Mutex<[Option<Shortcut>; 2]>,
}

impl Desktop {
    pub fn new(settings: Settings) -> Self {
        Self {
            settings: Mutex::new(settings),
            shortcuts: Mutex::new([None, None]),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }
}

/// Cambia los ajustes y los guarda.
pub fn update_settings(app: &AppHandle, change: impl FnOnce(&mut Settings)) {
    let state = app.state::<Desktop>();
    let settings = {
        let mut settings = state.settings.lock().unwrap();
        change(&mut settings);
        settings.clone()
    };
    settings::save(app, &settings);
}

/// Lo que la página necesita saber de la parte de escritorio.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
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

pub fn info(app: &AppHandle) -> DesktopInfo {
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
