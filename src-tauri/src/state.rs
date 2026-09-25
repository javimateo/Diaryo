use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::Shortcut;

use crate::backup;
use crate::desk_layer::DeskLayer;
use crate::settings::{self, Settings};
use crate::texts::Lang;
use crate::window::{Mode, Windowing};

/// Desktop settings and the global shortcuts that are working (the floating diary's and
/// the desk on the desktop's; None if another app took it).
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

/// The app language, for the texts of this side.
pub fn lang(app: &AppHandle) -> Lang {
    Lang::from_code(&app.state::<Desktop>().settings().language)
}

/// Changes the settings and saves them.
pub fn update_settings(app: &AppHandle, change: impl FnOnce(&mut Settings)) {
    let state = app.state::<Desktop>();
    let settings = {
        let mut settings = state.settings.lock().unwrap();
        change(&mut settings);
        settings.clone()
    };
    settings::save(app, &settings);
}

/// What the page needs to know about the desktop side.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    mode: Mode,
    shortcut: String,
    /// The shortcut is working (otherwise another app took it).
    shortcut_ok: bool,
    autostart: bool,
    backups: bool,
    backup_dir: String,
    /// The desk on the Windows desktop.
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
