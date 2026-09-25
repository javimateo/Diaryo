use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

/// Settings the desktop side needs before the page loads: the global shortcut, for
/// example, works even if the window hasn't opened yet.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Global shortcut of the floating diary.
    pub shortcut: String,
    /// Automatic backups in a folder.
    pub backups: bool,
    /// Backups folder (None: Documents\diaryo).
    pub backup_dir: Option<String>,
    /// Start with Windows was already enabled the first time (then whatever is chosen
    /// rules).
    pub autostart_ready: bool,
    /// The desk on the Windows desktop.
    pub desk_layer: bool,
    /// Global shortcut that shows or hides it.
    pub desk_shortcut: String,
    /// App language ("es" or "en"; set by the page).
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut: "Ctrl+Alt+D".into(),
            backups: true,
            backup_dir: None,
            autostart_ready: false,
            desk_layer: true,
            desk_shortcut: "Ctrl+Alt+N".into(),
            language: "es".into(),
        }
    }
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    path(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, settings: &Settings) {
    let Some(path) = path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(path, text);
    }
}
