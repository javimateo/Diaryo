//! What the diary page can ask the desktop side for.

use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::backup;
use crate::desk_layer;
use crate::shortcuts::{self, Hotkey};
use crate::state::{info, lang, update_settings, Desktop, DesktopInfo};
use crate::tray;
use crate::window::{self, Mode};

#[tauri::command]
pub fn desktop_info(app: AppHandle) -> DesktopInfo {
    info(&app)
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, shortcut: String) -> Result<DesktopInfo, String> {
    shortcuts::register(&app, Hotkey::Widget, &shortcut)?;
    update_settings(&app, |settings| settings.shortcut = shortcut);
    Ok(info(&app))
}

#[tauri::command]
pub fn set_desk_shortcut(app: AppHandle, shortcut: String) -> Result<DesktopInfo, String> {
    shortcuts::register(&app, Hotkey::Desk, &shortcut)?;
    update_settings(&app, |settings| settings.desk_shortcut = shortcut);
    Ok(info(&app))
}

#[tauri::command]
pub fn set_desk_layer(app: AppHandle, enabled: bool) -> DesktopInfo {
    update_settings(&app, |settings| settings.desk_layer = enabled);
    desk_layer::set_enabled(&app, enabled);
    info(&app)
}

/// Where there is something on the desktop desk (there it takes the mouse).
#[tauri::command]
pub fn set_desk_areas(app: AppHandle, areas: Vec<desk_layer::Area>) {
    desk_layer::set_areas(&app, areas);
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<DesktopInfo, String> {
    let launcher = app.autolaunch();
    let result = if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    };
    result.map_err(|e| e.to_string())?;
    Ok(info(&app))
}

#[tauri::command]
pub fn set_backups(app: AppHandle, enabled: bool) -> DesktopInfo {
    update_settings(&app, |settings| settings.backups = enabled);
    info(&app)
}

#[tauri::command]
pub async fn choose_backup_dir(app: AppHandle) -> Result<DesktopInfo, String> {
    let current = backup::dir(&app, &app.state::<Desktop>().settings())?;
    let mut dialog = app
        .dialog()
        .file()
        .set_title(lang(&app).backup_folder_title());
    if current.exists() {
        dialog = dialog.set_directory(&current);
    }
    if let Some(window) = window::main_window(&app) {
        dialog = dialog.set_parent(&window);
    }
    if let Some(folder) = dialog.blocking_pick_folder() {
        let path = folder.into_path().map_err(|e| e.to_string())?;
        update_settings(&app, |settings| {
            settings.backup_dir = Some(path.display().to_string())
        });
    }
    Ok(info(&app))
}

#[tauri::command]
pub fn open_backup_dir(app: AppHandle) -> Result<(), String> {
    let dir = backup::dir(&app, &app.state::<Desktop>().settings())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Saves the day's backup in the backups folder. Returns where.
#[tauri::command]
pub async fn write_backup(app: AppHandle, day: String, contents: String) -> Result<String, String> {
    let settings = app.state::<Desktop>().settings();
    if !settings.backups {
        return Err(lang(&app).backups_off().into());
    }
    let dir = backup::dir(&app, &settings)?;
    backup::write(&dir, &day, &contents).map(|path| path.display().to_string())
}

/// The page already looks as it should: the window can be shown.
#[tauri::command]
pub fn frontend_ready(app: AppHandle) {
    window::reveal_if_pending(&app);
}

#[tauri::command]
pub fn show_mode(app: AppHandle, mode: Mode) {
    window::show(&app, mode);
}

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    window::hide_now(&app);
}

/// The page's language: the texts of this side (the tray, the errors) follow it.
#[tauri::command]
pub fn set_language(app: AppHandle, language: String) {
    update_settings(&app, |settings| settings.language = language);
    tray::update_texts(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
