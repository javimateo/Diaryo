use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

use crate::settings::Settings;

/// Copias que se guardan (una por día: las de las dos últimas semanas).
const KEEP: usize = 14;

/// Carpeta de las copias: la elegida o, si no, Documentos\diaryo. La versión de
/// desarrollo tiene su propio diario: sus copias van aparte (en `desarrollo`) para no
/// pisar las del diario de verdad.
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

/// AAAA-MM-DD
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

/// Guarda la copia del día (sustituye la de antes de ese mismo día) y borra las más viejas.
pub fn write(dir: &Path, day: &str, contents: &str) -> Result<PathBuf, String> {
    if !is_day(day) {
        return Err(format!("«{day}» no es un día"));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("diaryo-{day}.diaryo"));
    // Primero a un archivo aparte: si algo falla a medias, la copia anterior sigue entera.
    let partial = dir.join(format!(".diaryo-{day}.partial"));
    fs::write(&partial, contents).map_err(|e| e.to_string())?;
    fs::rename(&partial, &path).map_err(|e| e.to_string())?;
    prune(dir);
    Ok(path)
}

/// Deja solo las `KEEP` copias más recientes (el nombre lleva la fecha, así que se ordenan solas).
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
    fn solo_cuenta_las_copias_con_fecha() {
        assert!(is_backup("diaryo-2026-09-25.diaryo"));
        assert!(!is_backup("diaryo-2026-9-25.diaryo"));
        assert!(!is_backup("mis-notas.diaryo"));
        assert!(!is_backup("diaryo-2026-09-25.txt"));
    }

    #[test]
    fn guarda_una_por_dia_y_borra_las_viejas() {
        let dir = temp_dir("prune");
        for day in 1..=20 {
            write(&dir, &format!("2026-09-{day:02}"), "{}").unwrap();
        }
        // La del mismo día se sustituye.
        write(&dir, "2026-09-20", "nueva").unwrap();
        fs::write(dir.join("otra-cosa.txt"), "no se toca").unwrap();

        let mut names: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names.len(), KEEP + 1);
        assert_eq!(names[0], "diaryo-2026-09-07.diaryo");
        assert!(names.contains(&"otra-cosa.txt".to_string()));
        assert_eq!(
            fs::read_to_string(dir.join("diaryo-2026-09-20.diaryo")).unwrap(),
            "nueva"
        );
        assert!(write(&dir, "../fuera", "{}").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
