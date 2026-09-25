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

/// Cómo se ve el diario: en su ventana o flotando sobre el escritorio (el widget).
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Window,
    Widget,
}

/// Dónde estaba la ventana normal, para volver a ella después del widget.
#[derive(Clone, Copy)]
struct Place {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
}

pub struct Windowing {
    mode: Mutex<Mode>,
    place: Mutex<Option<Place>>,
    /// Dónde va el diario flotante: la pantalla entera.
    screen: Mutex<Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>>,
    /// La ventana se enseña cuando la página ya tiene el aspecto nuevo (o, si tarda, enseguida).
    pending: AtomicBool,
    /// Cuántas veces se ha enseñado: si se vuelve a enseñar mientras se aparta, ya no se
    /// esconde.
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

/// Enseña el diario en su ventana o flotando sobre el escritorio.
///
/// Para cambiar de uno a otro, la ventana se esconde, cambia (marco, tamaño, encima de
/// todo) y avisa a la página, que se pone la mesa transparente (o la de siempre) y
/// contesta con `frontend_ready`; entonces se enseña. Así no se ve el cambio a medias.
/// Nunca se llama a la ventana con un cerrojo cogido: sus llamadas pasan por el hilo
/// principal y podría quedarse todo esperando.
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
    let _ = window.hide();
    match mode {
        Mode::Widget => {
            // La posición es la de fuera (con el marco) y el tamaño el de dentro: son los
            // que luego se ponen con `set_position` y `set_size`.
            let place = match (window.outer_position(), window.inner_size()) {
                (Ok(position), Ok(size)) => Some(Place {
                    position,
                    size,
                    maximized: window.is_maximized().unwrap_or(false),
                }),
                _ => None,
            };
            *state.place.lock().unwrap() = place;
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
            // Sin el marco de Windows: la app lleva sus propios botones y se arrastra
            // desde arriba.
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

/// Enseña la ventana si estaba pendiente de hacerlo.
pub fn reveal_if_pending(app: &AppHandle) {
    if app
        .state::<Windowing>()
        .pending
        .swap(false, Ordering::SeqCst)
    {
        reveal(app);
    }
}

/// Si la página no avisa a tiempo (aún está cargando, por ejemplo), se enseña igual.
pub fn reveal_later(app: &AppHandle, delay: Duration) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        reveal_if_pending(&app);
    });
}

/// El diario flotante ocupa la pantalla entera.
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
        // Si la ventana estaba maximizada, al quitárselo Windows la devuelve a su tamaño de
        // antes (a veces después de ponerla a pantalla completa): se vuelve a poner.
        if state.mode() == Mode::Widget {
            if window.is_maximized().unwrap_or(false) {
                let _ = window.unmaximize();
            }
            if let Some(screen) = screen {
                fill_screen(&window, screen);
            }
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        state.shows.fetch_add(1, Ordering::SeqCst);
        // La página lo hace aparecer poco a poco.
        let _ = app.emit("diaryo://shown", ());
    }
}

/// Aparta el diario. El flotante se desvanece antes: la página hace la animación y
/// contesta con `hide_window`; si no contesta a tiempo, se esconde igual.
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
    let _ = app.emit("diaryo://closing", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        if app.state::<Windowing>().shows.load(Ordering::SeqCst) == shows {
            hide_now(&app);
        }
    });
}

/// Esconde el diario ya (sigue en la bandeja, listo para el atajo) y avisa a la página
/// para que guarde su copia.
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

/// El atajo: si el diario flotante está a la vista lo esconde; si no, lo enseña.
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

/// El diario flotante se esconde al pasar a otra app (como un aviso que se aparta). Los
/// diálogos del propio diaryo (elegir una carpeta, abrir una copia) no cuentan.
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
    // SAFETY: solo se consulta qué ventana está delante y de qué proceso es.
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
