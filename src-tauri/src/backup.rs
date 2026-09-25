use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

use crate::settings::Settings;

/// Backups kept (one per day: those of the last two weeks).
const KEEP: usize = 14;

/// Backups folder: the chosen one or, otherwise, Documents\diaryo. The development build
/// has its own diary: its backups go separately (in `desarrollo`) so they don't overwrite
/// the real diary's.
pub fn dir(app: &AppHandle, settings: &Settings) -> Result<PathBuf, String> {
    let dir = match &settings.backup_dir {
        Some(dir) => PathBuf::from(dir),
        None => app
            .path()
            .document_dir()
            .map(|dir| dir.join("diaryo"))
            .map_err(|e| e.to_string())?,
    };
    Ok(if cfg!(debug_assertions) {
        dir.join("desarrollo")
    } else {
        dir
    })
}

/// YYYY-MM-DD
fn is_day(day: &str) -> bool {
    day.len() == 10
        && day.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == '-'
            } else {
                c.is_ascii_digit()
            }
        })
}

fn is_backup(name: &str) -> bool {
    name.strip_prefix("diaryo-")
        .and_then(|rest| rest.strip_suffix(".diaryo"))
        .is_some_and(is_day)
}

/// Saves the day's backup (replacing the earlier one of that same day) and deletes the
/// oldest ones.
pub fn write(dir: &Path, day: &str, contents: &str) -> Result<PathBuf, String> {
    if !is_day(day) {
        return Err(format!("\"{day}\" is not a day"));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("diaryo-{day}.diaryo"));
    // First to a separate file: if something fails halfway, the previous backup stays
    // whole.
    let partial = dir.join(format!(".diaryo-{day}.partial"));
    fs::write(&partial, contents).map_err(|e| e.to_string())?;
    fs::rename(&partial, &path).map_err(|e| e.to_string())?;
    prune(dir);
    Ok(path)
}

/// Keeps only the `KEEP` most recent backups (the name carries the date, so they sort by
/// themselves).
fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|name| is_backup(name))
        .collect();
    names.sort();
    let extra = names.len().saturating_sub(KEEP);
    for name in &names[..extra] {
        let _ = fs::remove_file(dir.join(name));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("diaryo-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn only_counts_dated_backups() {
        assert!(is_backup("diaryo-2026-09-25.diaryo"));
        assert!(!is_backup("diaryo-2026-9-25.diaryo"));
        assert!(!is_backup("my-notes.diaryo"));
        assert!(!is_backup("diaryo-2026-09-25.txt"));
    }

    #[test]
    fn keeps_one_per_day_and_prunes_old_ones() {
        let dir = temp_dir("prune");
        for day in 1..=20 {
            write(&dir, &format!("2026-09-{day:02}"), "{}").unwrap();
        }
        // The one of the same day is replaced.
        write(&dir, "2026-09-20", "new").unwrap();
        fs::write(dir.join("something-else.txt"), "left alone").unwrap();

        let mut names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names.len(), KEEP + 1);
        assert_eq!(names[0], "diaryo-2026-09-07.diaryo");
        assert!(names.contains(&"something-else.txt".to_string()));
        assert_eq!(
            fs::read_to_string(dir.join("diaryo-2026-09-20.diaryo")).unwrap(),
            "new"
        );
        assert!(write(&dir, "../outside", "{}").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
