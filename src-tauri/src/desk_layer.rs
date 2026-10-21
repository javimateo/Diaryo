//! The desk on the Windows desktop: a transparent, screen-sized window, right above the
//! desktop wallpaper and behind the other windows. It draws what is on the desk in the
//! same place as around the floating diary.
//!
//! It only takes the mouse where there is something: the page sends those areas
//! (`set_areas`) and a thread watches where the cursor is; outside them, the window lets
//! clicks through to the desktop. While something is being dragged it doesn't change, so
//! it isn't dropped halfway.

use serde::Deserialize;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "desk";

/// An area with something on it, in window pixels (the page's).
#[derive(Clone, Copy, Deserialize)]
pub struct Area {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// An area in screen pixels.
#[derive(Clone, Copy)]
struct ScreenArea {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

pub struct DeskLayer {
    /// The desk on the desktop is wanted (Settings or `Ctrl+Alt+N`).
    enabled: AtomicBool,
    /// The floating diary is in front (it already shows the desk: this one steps aside).
    covered: AtomicBool,
    /// The window is visible.
    shown: AtomicBool,
    areas: Mutex<Vec<ScreenArea>>,
}

impl DeskLayer {
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled: AtomicBool::new(enabled),
            covered: AtomicBool::new(false),
            shown: AtomicBool::new(false),
            areas: Mutex::new(Vec::new()),
        }
    }

    pub fn enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }
}

fn layer_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

/// Creates the window (hidden) and the thread that decides whether it lets clicks
/// through.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let window =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?capa=mesa".into()))
            .title("diaryo · mesa")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .skip_taskbar(true)
            .resizable(false)
            .minimizable(false)
            .maximizable(false)
            .focused(false)
            .visible(false)
            .build()?;
    fit_to_screen(app, &window);
    #[cfg(windows)]
    win::setup(&window);
    #[cfg(not(windows))]
    let _ = window.set_ignore_cursor_events(true);

    let app = app.clone();
    std::thread::spawn(move || watch(app));
    Ok(())
}

/// Takes the whole primary screen, like the floating diary.
fn fit_to_screen(app: &AppHandle, window: &WebviewWindow) {
    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
    }
}

/// Shows or hides itself as appropriate (enabled and without the floating diary in
/// front).
pub fn refresh(app: &AppHandle) {
    let state = app.state::<DeskLayer>();
    let visible = state.enabled() && !state.covered.load(Ordering::SeqCst);
    if state.shown.swap(visible, Ordering::SeqCst) == visible {
        return;
    }
    let Some(window) = layer_window(app) else {
        return;
    };
    if visible {
        fit_to_screen(app, &window);
        #[cfg(windows)]
        win::show(&window);
        #[cfg(not(windows))]
        let _ = window.show();
        let _ = window.emit_to(LABEL, "diaryo://desk-shown", ());
    } else {
        #[cfg(windows)]
        win::hide(&window);
        #[cfg(not(windows))]
        let _ = window.hide();
    }
}

/// The floating diary is shown (covers the desk) or put away.
pub fn set_covered(app: &AppHandle, covered: bool) {
    app.state::<DeskLayer>()
        .covered
        .store(covered, Ordering::SeqCst);
    refresh(app);
}

pub fn set_enabled(app: &AppHandle, enabled: bool) {
    app.state::<DeskLayer>()
        .enabled
        .store(enabled, Ordering::SeqCst);
    refresh(app);
}

/// The areas with something on them, from the page to the screen.
pub fn set_areas(app: &AppHandle, areas: Vec<Area>) {
    let Some(window) = layer_window(app) else {
        return;
    };
    let (Ok(origin), Ok(scale)) = (window.inner_position(), window.scale_factor()) else {
        return;
    };
    let areas = areas
        .into_iter()
        .map(|area| ScreenArea {
            left: origin.x as f64 + area.x * scale,
            top: origin.y as f64 + area.y * scale,
            right: origin.x as f64 + (area.x + area.width) * scale,
            bottom: origin.y as f64 + (area.y + area.height) * scale,
        })
        .collect();
    *app.state::<DeskLayer>().areas.lock().unwrap() = areas;
}

/// Checks the cursor about 60 times per second: over something on the desk, the window
/// takes the mouse; outside, clicks go through to the desktop. Now and then it also
/// checks whether the desktop was requested (`Win+D`), which would leave the desk behind.
fn watch(app: AppHandle) {
    let mut tick = 0u32;
    loop {
        std::thread::sleep(Duration::from_millis(16));
        let state = app.state::<DeskLayer>();
        if !state.shown.load(Ordering::SeqCst) {
            continue;
        }
        #[cfg(windows)]
        {
            let over = win::cursor().is_some_and(|(x, y)| {
                state
                    .areas
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|a| x >= a.left && x <= a.right && y >= a.top && y <= a.bottom)
            });
            // With a button pressed it stays as it was (something is being dragged, or a
            // drag across the desktop passes over a note).
            if !win::button_down() {
                win::set_click_through(!over);
            }
            tick = tick.wrapping_add(1);
            if tick % 6 == 0 {
                win::follow_show_desktop();
            }
        }
        #[cfg(not(windows))]
        let _ = (&mut tick, &state);
    }
}

#[cfg(windows)]
mod win {
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering};
    use tauri::WebviewWindow;
    use windows_sys::Win32::{
        Foundation::{BOOL, HWND, LPARAM, LRESULT, POINT, WPARAM},
        UI::{
            Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON},
            Shell::{DefSubclassProc, SetWindowSubclass},
            WindowsAndMessaging::{
                EnumWindows, FindWindowExW, GetClassNameW, GetCursorPos, GetForegroundWindow,
                GetWindow, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow,
                GWL_EXSTYLE, GWL_STYLE, GW_HWNDPREV, HWND_NOTOPMOST, HWND_TOP, HWND_TOPMOST,
                STYLESTRUCT, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE,
                SW_SHOWNOACTIVATE, WINDOWPOS, WM_STYLECHANGING, WM_WINDOWPOSCHANGING,
                WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
                WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_VISIBLE,
            },
        },
    };

    /// The desk window (there is only one).
    static WINDOW: AtomicIsize = AtomicIsize::new(0);
    /// Lets clicks through (outside what is on the desk).
    static CLICK_THROUGH: AtomicBool = AtomicBool::new(true);
    /// The desktop is being shown (`Win+D`): the desk moves to the front until another
    /// window is activated.
    static SHOWING_DESKTOP: AtomicBool = AtomicBool::new(false);
    /// Checks in a row that looked like `Win+D` (see `follow_show_desktop`).
    static DESKTOP_AHEAD: AtomicU32 = AtomicU32::new(0);
    /// How many checks in a row (one every ~100 ms) it must look like `Win+D`.
    const CONFIRM_CHECKS: u32 = 2;

    fn hwnd() -> HWND {
        WINDOW.load(Ordering::SeqCst) as HWND
    }

    pub fn setup(window: &WebviewWindow) {
        let Ok(handle) = window.hwnd() else { return };
        let hwnd = handle.0 as HWND;
        WINDOW.store(hwnd as isize, Ordering::SeqCst);
        // SAFETY: the window is ours and this is called from its thread (the main one).
        // The subclass lives as long as the window.
        unsafe {
            SetWindowSubclass(hwnd, Some(subclass), 1, 0);
            // Set the styles again so they go through `subclass`.
            refresh_styles(hwnd);
        }
    }

    unsafe fn refresh_styles(hwnd: HWND) {
        SetWindowLongPtrW(hwnd, GWL_STYLE, GetWindowLongPtrW(hwnd, GWL_STYLE));
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    }

    /// The window's messages before anyone else: styles and place among the windows.
    unsafe extern "system" fn subclass(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        match msg {
            // Whoever changes the styles (Tauri does it often), it stays out of the
            // taskbar and Alt+Tab, can't be minimized (`Win+M` doesn't hide it) and lets
            // clicks through when appropriate.
            WM_STYLECHANGING => {
                let styles = &mut *(lparam as *mut STYLESTRUCT);
                if wparam as i32 == GWL_EXSTYLE {
                    let mut ex = styles.styleNew | WS_EX_TOOLWINDOW | WS_EX_LAYERED;
                    ex &= !WS_EX_APPWINDOW;
                    if CLICK_THROUGH.load(Ordering::SeqCst) {
                        ex |= WS_EX_TRANSPARENT;
                    } else {
                        ex &= !WS_EX_TRANSPARENT;
                    }
                    styles.styleNew = ex;
                } else if wparam as i32 == GWL_STYLE {
                    let visible = styles.styleOld & WS_VISIBLE;
                    styles.styleNew = (styles.styleNew
                        & !(WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_VISIBLE))
                        | visible;
                }
            }
            // Always right above the desktop wallpaper (with its icons): behind every
            // other window, even when clicked.
            WM_WINDOWPOSCHANGING if !SHOWING_DESKTOP.load(Ordering::SeqCst) => {
                let pos = &mut *(lparam as *mut WINDOWPOS);
                if pos.flags & SWP_NOZORDER == 0 {
                    match place_after(hwnd) {
                        Some(after) => pos.hwndInsertAfter = after,
                        None => pos.flags |= SWP_NOZORDER,
                    }
                }
            }
            _ => {}
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    /// The window the desk goes behind so it stays right above the desktop, or None if it
    /// is already there.
    unsafe fn place_after(hwnd: HWND) -> Option<HWND> {
        let desktop = desktop_window();
        if desktop.is_null() {
            return None;
        }
        let above = GetWindow(desktop, GW_HWNDPREV);
        if above == hwnd {
            None
        } else if above.is_null() {
            Some(HWND_TOP)
        } else {
            Some(above)
        }
    }

    /// The desktop window: the one with the icons (`SHELLDLL_DefView`). Usually
    /// "Progman"; with some wallpapers, a "WorkerW".
    unsafe fn desktop_window() -> HWND {
        unsafe extern "system" fn find(hwnd: HWND, found: LPARAM) -> BOOL {
            let icons = FindWindowExW(
                hwnd,
                std::ptr::null_mut(),
                wide("SHELLDLL_DefView").as_ptr(),
                std::ptr::null(),
            );
            if icons.is_null() {
                return 1;
            }
            *(found as *mut HWND) = hwnd;
            0
        }
        let mut found: HWND = std::ptr::null_mut();
        EnumWindows(Some(find), &mut found as *mut HWND as LPARAM);
        found
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// The desktop itself or the taskbar (windows of the shell, not of an app).
    unsafe fn is_shell(hwnd: HWND) -> bool {
        matches!(
            class_of(hwnd).as_str(),
            "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
        )
    }

    unsafe fn class_of(hwnd: HWND) -> String {
        let mut buffer = [0u16; 64];
        let len = GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        String::from_utf16_lossy(&buffer[..len.max(0) as usize])
    }

    pub fn show(_window: &WebviewWindow) {
        let hwnd = hwnd();
        if hwnd.is_null() {
            return;
        }
        // SAFETY: the window is ours. It is shown without taking the focus from anyone.
        unsafe {
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(
                hwnd,
                HWND_TOP,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }

    pub fn hide(_window: &WebviewWindow) {
        let hwnd = hwnd();
        if !hwnd.is_null() {
            // SAFETY: the window is ours.
            unsafe { ShowWindow(hwnd, SW_HIDE) };
        }
    }

    /// Where the cursor is, in screen pixels.
    pub fn cursor() -> Option<(f64, f64)> {
        let mut point = POINT { x: 0, y: 0 };
        // SAFETY: only the cursor position is read.
        (unsafe { GetCursorPos(&mut point) } != 0).then_some((point.x as f64, point.y as f64))
    }

    pub fn button_down() -> bool {
        // SAFETY: only the state of the mouse buttons is read.
        unsafe {
            GetAsyncKeyState(VK_LBUTTON as i32) < 0 || GetAsyncKeyState(VK_RBUTTON as i32) < 0
        }
    }

    /// Lets clicks through to the desktop (or not).
    pub fn set_click_through(through: bool) {
        if CLICK_THROUGH.swap(through, Ordering::SeqCst) == through {
            return;
        }
        let hwnd = hwnd();
        if !hwnd.is_null() {
            // SAFETY: the window is ours; `subclass` sets the right style.
            unsafe { SetWindowLongPtrW(hwnd, GWL_EXSTYLE, GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) };
        }
    }

    /// With `Win+D`, the desktop comes in front of everything and the desk would stay
    /// behind: it moves to the front too, until another window is activated.
    pub fn follow_show_desktop() {
        let hwnd = hwnd();
        if hwnd.is_null() {
            return;
        }
        // SAFETY: only windows are queried and ours is moved.
        unsafe {
            let desktop = desktop_window();
            if desktop.is_null() {
                return;
            }
            if !SHOWING_DESKTOP.load(Ordering::SeqCst) {
                // `Win+D` leaves the desktop above the desk *and* active. The Explorer
                // reorders the desktop windows for a moment when it reloads (switching
                // drives, for example) while its own window stays active: that isn't it.
                // And it must last, not be a passing reorder.
                let foreground = GetForegroundWindow();
                let desktop_active = foreground.is_null() || is_shell(foreground);
                if !is_above(desktop, hwnd) || !desktop_active {
                    DESKTOP_AHEAD.store(0, Ordering::SeqCst);
                    return;
                }
                if DESKTOP_AHEAD.fetch_add(1, Ordering::SeqCst) + 1 >= CONFIRM_CHECKS {
                    DESKTOP_AHEAD.store(0, Ordering::SeqCst);
                    SHOWING_DESKTOP.store(true, Ordering::SeqCst);
                    SetWindowPos(
                        hwnd,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                }
                return;
            }
            let foreground = GetForegroundWindow();
            if !foreground.is_null() && foreground != hwnd && !is_shell(foreground) {
                SHOWING_DESKTOP.store(false, Ordering::SeqCst);
                SetWindowPos(
                    hwnd,
                    HWND_NOTOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
                // `subclass` puts it back right above the desktop.
                SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }

    /// `a` is in front of `b`.
    unsafe fn is_above(a: HWND, b: HWND) -> bool {
        let mut current = GetWindow(b, GW_HWNDPREV);
        while !current.is_null() {
            if current == a {
                return true;
            }
            current = GetWindow(current, GW_HWNDPREV);
        }
        false
    }
}
