use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};

/// How the diary looks: in its window or floating over the desktop (the widget).
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Window,
    Widget,
}

/// Where the normal window was, to go back to it after the widget.
#[derive(Clone, Copy)]
struct Place {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
}

pub struct Windowing {
    mode: Mutex<Mode>,
    place: Mutex<Option<Place>>,
    /// Where the floating diary goes: the whole screen.
    screen: Mutex<Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>>,
    /// The window is shown when the page already has the new look (or, if it takes long,
    /// right away).
    pending: AtomicBool,
    /// How many times it was shown: if it is shown again while going away, it isn't
    /// hidden.
    shows: AtomicU32,
}

impl Windowing {
    pub fn new(show_at_start: bool) -> Self {
        Self {
            mode: Mutex::new(Mode::Window),
            place: Mutex::new(None),
            screen: Mutex::new(None),
            pending: AtomicBool::new(show_at_start),
            shows: AtomicU32::new(0),
        }
    }

    pub fn mode(&self) -> Mode {
        *self.mode.lock().unwrap()
    }
}

pub fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Shows the diary in its window or floating over the desktop.
///
/// To switch from one to the other, the window hides, changes (frame, size, always on
/// top) and tells the page, which switches to the transparent desk (or the usual one) and
/// replies with `frontend_ready`; then it is shown. That way the change isn't seen
/// halfway. The window is never called with a lock held: its calls go through the main
/// thread and everything could end up waiting.
pub fn show(app: &AppHandle, mode: Mode) {
    let Some(window) = main_window(app) else {
        return;
    };
    crate::desk_layer::set_covered(app, mode == Mode::Widget);
    let state = app.state::<Windowing>();
    let current = state.mode();
    if current == mode {
        reveal(app);
        return;
    }
    let minimized = window.is_minimized().unwrap_or(false);
    let _ = window.hide();
    match mode {
        Mode::Widget => {
            // The position is the outer one (with the frame) and the size the inner one:
            // those are the ones set later with `set_position` and `set_size`. Minimized,
            // Windows reports it far off screen (-32000): the last good place is kept (or,
            // without one, the window comes back centered).
            let place = match (window.outer_position(), window.inner_size()) {
                (Ok(position), Ok(size)) if !minimized => Some(Place {
                    position,
                    size,
                    maximized: window.is_maximized().unwrap_or(false),
                }),
                _ => None,
            };
            if place.is_some() || !minimized {
                *state.place.lock().unwrap() = place;
            }
            let monitor = window
                .current_monitor()
                .ok()
                .flatten()
                .or_else(|| window.primary_monitor().ok().flatten());
            let _ = window.unmaximize();
            let _ = window.set_decorations(false);
            let _ = window.set_shadow(false);
            let _ = window.set_skip_taskbar(true);
            let _ = window.set_always_on_top(true);
            if let Some(monitor) = monitor {
                let screen = (*monitor.position(), *monitor.size());
                *state.screen.lock().unwrap() = Some(screen);
                fill_screen(&window, screen);
            }
        }
        Mode::Window => {
            let _ = window.set_always_on_top(false);
            let _ = window.set_skip_taskbar(false);
            // Without the Windows frame: the app has its own buttons and is dragged from
            // the top.
            let _ = window.set_decorations(false);
            let _ = window.set_shadow(true);
            let place = *state.place.lock().unwrap();
            match place {
                Some(place) => {
                    let _ = window.set_size(place.size);
                    let _ = window.set_position(place.position);
                    if place.maximized {
                        let _ = window.maximize();
                    }
                }
                None => {
                    let _ = window.set_size(LogicalSize::new(1280.0, 820.0));
                    let _ = window.center();
                }
            }
        }
    }
    *state.mode.lock().unwrap() = mode;
    state.pending.store(true, Ordering::SeqCst);
    let _ = app.emit("diaryo://mode", mode);
    reveal_later(app, Duration::from_millis(400));
}

/// Shows the window if it was pending.
pub fn reveal_if_pending(app: &AppHandle) {
    if app
        .state::<Windowing>()
        .pending
        .swap(false, Ordering::SeqCst)
    {
        reveal(app);
    }
}

/// If the page doesn't reply in time (it is still loading, for example), it is shown
/// anyway.
pub fn reveal_later(app: &AppHandle, delay: Duration) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        reveal_if_pending(&app);
    });
}

/// The floating diary takes the whole screen.
fn fill_screen(
    window: &WebviewWindow,
    (position, size): (PhysicalPosition<i32>, PhysicalSize<u32>),
) {
    let _ = window.set_position(position);
    let _ = window.set_size(size);
}

fn reveal(app: &AppHandle) {
    let state = app.state::<Windowing>();
    state.pending.store(false, Ordering::SeqCst);
    let screen = *state.screen.lock().unwrap();
    if let Some(window) = main_window(app) {
        // If the window was maximized, when unmaximizing Windows restores its earlier
        // size (sometimes after setting it to full screen): it is set again.
        let _ = window.show();
        // Restored first: sized while minimized, Windows would give it back its earlier
        // size when restoring it.
        let _ = window.unminimize();
        if state.mode() == Mode::Widget {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
            }
            if let Some(screen) = screen {
                fill_screen(&window, screen);
            }
        }
        let _ = window.set_focus();
        state.shows.fetch_add(1, Ordering::SeqCst);
        // The page fades it in, in the mode it is shown in: if it missed a change of mode
        // (it was loading, for example), it catches up now.
        let _ = app.emit("diaryo://shown", state.mode());
    }
}

/// Puts the diary away. The floating one fades out first: the page runs the animation and
/// replies with `hide_window`; if it doesn't reply in time, it is hidden anyway.
pub fn hide(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let state = app.state::<Windowing>();
    if state.mode() != Mode::Widget || !window.is_visible().unwrap_or(false) {
        hide_now(app);
        return;
    }
    let shows = state.shows.load(Ordering::SeqCst);
    // With which showing it goes: if it is shown again meanwhile, the page's late request to
    // hide it is ignored (`hide_if_current`).
    let _ = app.emit("diaryo://closing", shows);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        if app.state::<Windowing>().shows.load(Ordering::SeqCst) == shows {
            hide_now(&app);
        }
    });
}

/// Hides the diary, unless it was shown again since `shows` (the page asked when the fade
/// of an earlier showing ended).
pub fn hide_if_current(app: &AppHandle, shows: Option<u32>) {
    let current = app.state::<Windowing>().shows.load(Ordering::SeqCst);
    if shows.is_none_or(|shows| shows == current) {
        hide_now(app);
    }
}

/// Hides the diary right away (it stays in the tray, ready for the shortcut) and tells
/// the page so it saves its backup.
pub fn hide_now(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    crate::desk_layer::set_covered(app, false);
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = window.hide();
    let _ = app.emit("diaryo://hidden", ());
}

/// The shortcut: if the floating diary is visible it hides it; otherwise, it shows it.
pub fn toggle_widget(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    if visible && app.state::<Windowing>().mode() == Mode::Widget {
        hide(app);
    } else {
        show(app, Mode::Widget);
    }
}

/// The floating diary hides when switching to another app (like a notification stepping
/// aside). diaryo's own dialogs (choosing a folder, opening a backup) don't count.
pub fn hide_widget_on_blur(app: &AppHandle) {
    if app.state::<Windowing>().mode() != Mode::Widget {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        if app.state::<Windowing>().mode() == Mode::Widget && foreground_is_other_app() {
            hide(&app);
        }
    });
}

#[cfg(windows)]
fn foreground_is_other_app() -> bool {
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };
    // SAFETY: only which window is in front and which process it belongs to is queried.
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.is_null() {
            return false;
        }
        let mut process = 0u32;
        GetWindowThreadProcessId(foreground, &mut process);
        process != GetCurrentProcessId()
    }
}

#[cfg(not(windows))]
fn foreground_is_other_app() -> bool {
    true
}
