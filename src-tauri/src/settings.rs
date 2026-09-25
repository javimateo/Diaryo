use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

/// Ajustes que necesita la parte de escritorio antes de que cargue la página: el atajo
/// global, por ejemplo, funciona aunque la ventana no se haya abierto todavía.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Atajo global del diario flotante.
    pub shortcut: String,
    /// Copias automáticas en una carpeta.
    pub backups: bool,
    /// Carpeta de las copias (None: Documentos\diaryo).
    pub backup_dir: Option<String>,
    /// El arranque con Windows ya se activó la primera vez (luego manda lo que se elija).
    pub autostart_ready: bool,
    /// La mesa en el escritorio de Windows.
    pub desk_layer: bool,
    /// Atajo global que la enseña o la esconde.
    pub desk_shortcut: String,
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
