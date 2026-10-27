//! What the diary page can ask the desktop side for.

use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::backup;
use crate::desk_layer;
use crate::reminders;
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

/// Before opening another diary in place of this one, a copy of this one in the backups
/// folder (even with the daily backups off). Returns where.
#[tauri::command]
pub async fn write_copy_before_opening(
    app: AppHandle,
    moment: String,
    contents: String,
) -> Result<String, String> {
    let settings = app.state::<Desktop>().settings();
    let dir = backup::dir(&app, &settings)?;
    let label = lang(&app).before_opening();
    backup::write_before_opening(&dir, label, &moment, &contents)
        .map(|path| path.display().to_string())
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

/// Hides the diary. `shows` is the showing the page's request comes from (after a fade):
/// if it was shown again meanwhile, it stays.
#[tauri::command]
pub fn hide_window(app: AppHandle, shows: Option<u32>) {
    window::hide_if_current(&app, shows);
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

/// Opens Google's sign-in page in the browser (the page only asks for that page: any
/// other address is refused).
#[tauri::command]
pub fn open_sign_in(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://accounts.google.com/") {
        return Err("not a sign-in page".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Saves a file made by the page (a copy of the diary, an image, the account's data…)
/// where the user chooses, with the system's "Save as" dialog: the webview doesn't
/// download files by itself. The file comes as raw bytes and its suggested name in the
/// `x-file-name` header. Returns where it went, or nothing if the user cancelled.
#[tauri::command]
pub async fn save_file(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file's bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("diaryo");
    let mut dialog = app.dialog().file().set_file_name(name);
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }
    if let Some(window) = window::main_window(&app) {
        dialog = dialog.set_parent(&window);
    }
    let Some(file) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

/// diaryo's own pages: its website and its source code.
fn is_diaryo_page(url: &str) -> bool {
    const SOURCE: &str = "https://github.com/javimateo/Diaryo";
    url.starts_with("https://diaryo.javiermateo.dev/")
        || url == SOURCE
        || url.starts_with(&format!("{SOURCE}/"))
}

/// Opens one of diaryo's pages in the browser (the website, the privacy policy, the terms,
/// the source code); any other address is refused.
#[tauri::command]
pub fn open_website(app: AppHandle, url: String) -> Result<(), String> {
    if !is_diaryo_page(&url) {
        return Err("not one of diaryo's pages".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// The reminders to come (they are kept only in memory).
#[tauri::command]
pub fn set_reminders(app: AppHandle, reminders: Vec<reminders::Reminder>) {
    reminders::set(&app, reminders);
}

/// Shows a reminder now (those missed while diaryo was closed).
#[tauri::command]
pub fn show_reminder(app: AppHandle, reminder: reminders::Reminder) {
    reminders::show_now(&app, reminder);
}

/// How long the calendar app has to read the `.ics` file before it is deleted (it may wait
/// for the user to confirm the import).
const CALENDAR_FILE_LIFE: std::time::Duration = std::time::Duration::from_secs(10 * 60);

/// Opens tasks and appointments in the calendar app (the `.ics` file, in the temporary
/// folder, opened with the app Windows has for it). The file carries their text, so it
/// doesn't stay there: it is deleted a while later (and at start, if diaryo was closed
/// meanwhile, see `remove_calendar_files`).
#[tauri::command]
pub fn open_calendar_file(app: AppHandle, contents: String) -> Result<(), String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let path = std::env::temp_dir().join(format!("diaryo-{stamp}.ics"));
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    let opened = app
        .opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string());
    std::thread::spawn(move || {
        std::thread::sleep(CALENDAR_FILE_LIFE);
        let _ = std::fs::remove_file(&path);
    });
    opened
}

/// Deletes the calendar files left in a folder (the temporary one: diaryo was closed
/// before their time was up).
pub fn remove_calendar_files(dir: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("diaryo-") && name.ends_with(".ics") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_diaryos_pages() {
        assert!(is_diaryo_page("https://diaryo.javiermateo.dev/privacidad/"));
        assert!(is_diaryo_page("https://github.com/javimateo/Diaryo"));
        assert!(is_diaryo_page(
            "https://github.com/javimateo/Diaryo/releases"
        ));
        assert!(!is_diaryo_page(
            "https://github.com/javimateo/Diaryo.evil.example"
        ));
        assert!(!is_diaryo_page("https://github.com/someone/else"));
        assert!(!is_diaryo_page("file:///C:/Windows/System32/calc.exe"));
    }

    #[test]
    fn removes_only_the_calendar_files() {
        let dir = std::env::temp_dir().join(format!("diaryo-test-ics-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for name in [
            "diaryo-1.ics",
            "diaryo-2.ics",
            "other.ics",
            "diaryo-2026-10-15.diaryo",
        ] {
            std::fs::write(dir.join(name), "x").unwrap();
        }
        remove_calendar_files(&dir);
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        left.sort();
        assert_eq!(left, ["diaryo-2026-10-15.diaryo", "other.ics"]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
