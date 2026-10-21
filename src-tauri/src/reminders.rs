//! Reminders of tasks and appointments. The page sends the next ones (kept here only in
//! memory) and a thread shows each one as a Windows notification at its time, also with the
//! diary hidden in the tray. A click opens the floating diary on it. Windows keeps the
//! notifications it showed (on disk): with the whole diary encrypted, the page sends them
//! without their words.

use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

use crate::window::{self, Mode};

/// The page asks for this when a reminder is clicked.
const OPENED: &str = "diaryo://reminder-opened";
/// How often the clock is looked at (a sleep doesn't count the time the PC is suspended).
const TICK: Duration = Duration::from_secs(20);

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    /// The same reminder keeps its key: it is never shown twice.
    pub key: String,
    /// When (ms since 1970).
    pub at: i64,
    pub title: String,
    pub body: String,
    /// What opens when clicked: an element (page and id) or, without them, the tasks.
    pub page_id: Option<String>,
    pub element_id: Option<String>,
}

#[derive(Default)]
pub struct Reminders {
    next: Mutex<Vec<Reminder>>,
    shown: Mutex<HashSet<String>>,
}

/// The reminders to come, as the page has them now.
pub fn set(app: &AppHandle, list: Vec<Reminder>) {
    *app.state::<Reminders>().next.lock().unwrap() = list;
}

/// Shows one now (the summary of those missed while diaryo was closed).
pub fn show_now(app: &AppHandle, reminder: Reminder) {
    show(app, reminder);
}

/// Looks at the clock now and then and shows what is due.
pub fn start(app: &AppHandle) {
    app.manage(Reminders::default());
    let app = app.clone();
    thread::spawn(move || loop {
        thread::sleep(TICK);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as i64);
        let state = app.state::<Reminders>();
        let due: Vec<Reminder> = {
            let mut next = state.next.lock().unwrap();
            let (due, rest) = next.drain(..).partition(|r| r.at <= now);
            *next = rest;
            due
        };
        for reminder in due {
            if state.shown.lock().unwrap().insert(reminder.key.clone()) {
                show(&app, reminder);
            }
        }
    });
}

#[cfg(windows)]
fn show(app: &AppHandle, reminder: Reminder) {
    use tauri_winrt_notification::Toast;
    // Only the installed app has its own name and icon in Windows; in development the
    // notification comes from PowerShell.
    let installed = !cfg!(debug_assertions);
    let id = if installed {
        app.config().identifier.clone()
    } else {
        Toast::POWERSHELL_APP_ID.to_string()
    };
    let handle = app.clone();
    let opened = reminder.clone();
    let result = Toast::new(&id)
        .title(&reminder.title)
        .text1(&reminder.body)
        .on_activated(move |_| {
            window::show(&handle, Mode::Widget);
            let _ = handle.emit(OPENED, &opened);
            Ok(())
        })
        .show();
    if let Err(error) = result {
        eprintln!("couldn't show the reminder: {error}");
    }
}

#[cfg(not(windows))]
fn show(_app: &AppHandle, _reminder: Reminder) {}
