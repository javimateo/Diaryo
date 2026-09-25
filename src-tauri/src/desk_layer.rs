//! La mesa en el escritorio de Windows: una ventana transparente, del tamaño de la
//! pantalla, justo encima del fondo del escritorio y detrás de las demás ventanas. Pinta
//! lo que hay en la mesa en el mismo sitio que alrededor del diario flotante.
//!
//! Solo recibe el ratón donde hay algo: la página manda esas zonas (`set_areas`) y un
//! hilo mira dónde está el cursor; fuera de ellas, la ventana deja pasar los clics al
//! escritorio. Mientras se arrastra algo no cambia, para no soltarlo a medias.

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

/// Una zona con algo encima, en píxeles de la ventana (los de la página).
#[derive(Clone, Copy, Deserialize)]
pub struct Area {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Una zona en píxeles de la pantalla.
#[derive(Clone, Copy)]
struct ScreenArea {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

pub struct DeskLayer {
    /// Se quiere la mesa en el escritorio (Ajustes o `Ctrl+Alt+N`).
    enabled: AtomicBool,
    /// El diario flotante está delante (ya enseña la mesa: esta se aparta).
    covered: AtomicBool,
    /// La ventana está a la vista.
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

/// Crea la ventana (escondida) y el hilo que decide si deja pasar los clics.
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

/// Ocupa la pantalla principal entera, como el diario flotante.
fn fit_to_screen(app: &AppHandle, window: &WebviewWindow) {
    if let Some(monitor) = app.primary_monitor().ok().flatten() {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
    }
}

/// Se enseña o se esconde según lo que toque (activada y sin el diario flotante delante).
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

/// El diario flotante se enseña (tapa la mesa) o se aparta.
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

/// Las zonas con algo encima, de la página a la pantalla.
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

/// Mira el cursor unas 60 veces por segundo: sobre algo de la mesa, la ventana recibe el
/// ratón; fuera, los clics pasan al escritorio. De vez en cuando, mira también si se ha
/// pedido ver el escritorio (`Win+D`), que dejaría la mesa detrás.
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
            // Con un botón pulsado se sigue como estaba (se está arrastrando algo, o se
            // arrastra por el escritorio y se pasa por encima de una nota).
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
    use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
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

    /// La ventana de la mesa (solo hay una).
    static WINDOW: AtomicIsize = AtomicIsize::new(0);
    /// Deja pasar los clics (fuera de lo que hay en la mesa).
    static CLICK_THROUGH: AtomicBool = AtomicBool::new(true);
    /// Se está viendo el escritorio (`Win+D`): la mesa se pone delante hasta que se vuelva
    /// a otra ventana.
    static SHOWING_DESKTOP: AtomicBool = AtomicBool::new(false);

    fn hwnd() -> HWND {
        WINDOW.load(Ordering::SeqCst) as HWND
    }

    pub fn setup(window: &WebviewWindow) {
        let Ok(handle) = window.hwnd() else { return };
        let hwnd = handle.0 as HWND;
        WINDOW.store(hwnd as isize, Ordering::SeqCst);
        // SAFETY: la ventana es nuestra y se llama desde su hilo (el principal). El
        // subclass vive lo que la ventana.
        unsafe {
            SetWindowSubclass(hwnd, Some(subclass), 1, 0);
            // Vuelve a poner los estilos para que pasen por `subclass`.
            refresh_styles(hwnd);
        }
    }

    unsafe fn refresh_styles(hwnd: HWND) {
        SetWindowLongPtrW(hwnd, GWL_STYLE, GetWindowLongPtrW(hwnd, GWL_STYLE));
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    }

    /// Los mensajes de la ventana antes que nadie: estilos y sitio entre las ventanas.
    unsafe extern "system" fn subclass(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        match msg {
            // Sea quien sea quien cambie los estilos (Tauri lo hace a menudo), se queda
            // fuera de la barra de tareas y de Alt+Tab, sin minimizar (`Win+M` no la
            // esconde) y dejando pasar los clics cuando toca.
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
            // Siempre justo encima del fondo del escritorio (con sus iconos): detrás de
            // todas las demás ventanas, aunque se haga clic en ella.
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

    /// La ventana detrás de la que va la mesa para quedar justo encima del escritorio, o
    /// None si ya está ahí.
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

    /// La ventana del escritorio: la que tiene los iconos (`SHELLDLL_DefView`). Suele ser
    /// "Progman"; con algunos fondos, un "WorkerW".
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
        // SAFETY: la ventana es nuestra. Se enseña sin quitarle el foco a nadie.
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
            // SAFETY: la ventana es nuestra.
            unsafe { ShowWindow(hwnd, SW_HIDE) };
        }
    }

    /// Dónde está el cursor, en píxeles de la pantalla.
    pub fn cursor() -> Option<(f64, f64)> {
        let mut point = POINT { x: 0, y: 0 };
        // SAFETY: solo se lee la posición del cursor.
        (unsafe { GetCursorPos(&mut point) } != 0).then_some((point.x as f64, point.y as f64))
    }

    pub fn button_down() -> bool {
        // SAFETY: solo se lee el estado de los botones del ratón.
        unsafe {
            GetAsyncKeyState(VK_LBUTTON as i32) < 0 || GetAsyncKeyState(VK_RBUTTON as i32) < 0
        }
    }

    /// Deja pasar los clics al escritorio (o no).
    pub fn set_click_through(through: bool) {
        if CLICK_THROUGH.swap(through, Ordering::SeqCst) == through {
            return;
        }
        let hwnd = hwnd();
        if !hwnd.is_null() {
            // SAFETY: la ventana es nuestra; `subclass` pone el estilo que toca.
            unsafe { SetWindowLongPtrW(hwnd, GWL_EXSTYLE, GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) };
        }
    }

    /// Con `Win+D`, el escritorio pasa delante de todo y la mesa se quedaría detrás: se
    /// pone delante también, hasta que se vuelva a otra ventana.
    pub fn follow_show_desktop() {
        let hwnd = hwnd();
        if hwnd.is_null() {
            return;
        }
        // SAFETY: solo se consultan ventanas y se cambia el sitio de la nuestra.
        unsafe {
            let desktop = desktop_window();
            if desktop.is_null() {
                return;
            }
            if !SHOWING_DESKTOP.load(Ordering::SeqCst) {
                if is_above(desktop, hwnd) {
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
            let shell = matches!(
                class_of(foreground).as_str(),
                "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd"
            );
            if !foreground.is_null() && foreground != hwnd && !shell {
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
                // `subclass` la vuelve a dejar justo encima del escritorio.
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

    /// `a` está delante de `b`.
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
