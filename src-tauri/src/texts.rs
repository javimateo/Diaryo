//! The texts of the desktop side (tray menu, dialogs and errors), in the language chosen
//! by the page.

/// App language (the same as the page's).
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Es,
    En,
}

impl Lang {
    pub fn from_code(code: &str) -> Self {
        if code == "en" {
            Lang::En
        } else {
            Lang::Es
        }
    }

    pub fn open_diary(self) -> &'static str {
        match self {
            Lang::Es => "Abrir diaryo",
            Lang::En => "Open diaryo",
        }
    }

    pub fn floating_diary(self) -> &'static str {
        match self {
            Lang::Es => "Diario flotante",
            Lang::En => "Floating diary",
        }
    }

    pub fn quit(self) -> &'static str {
        match self {
            Lang::Es => "Salir",
            Lang::En => "Quit",
        }
    }

    pub fn backup_folder_title(self) -> &'static str {
        match self {
            Lang::Es => "Carpeta para las copias del diario",
            Lang::En => "Folder for the diary backups",
        }
    }

    /// Name of the copy saved before opening another diary in place of this one.
    pub fn before_opening(self) -> &'static str {
        match self {
            Lang::Es => "antes-de-abrir",
            Lang::En => "before-opening",
        }
    }

    pub fn backups_off(self) -> &'static str {
        match self {
            Lang::Es => "Las copias automáticas están apagadas",
            Lang::En => "Automatic backups are off",
        }
    }

    pub fn invalid_shortcut(self, accel: &str) -> String {
        match self {
            Lang::Es => format!("«{accel}» no es un atajo válido"),
            Lang::En => format!("“{accel}” isn't a valid shortcut"),
        }
    }

    pub fn shortcut_is_desk(self, accel: &str) -> String {
        match self {
            Lang::Es => format!("{accel} ya es el atajo de la mesa en el escritorio"),
            Lang::En => format!("{accel} is already the shortcut for the desk on the desktop"),
        }
    }

    pub fn shortcut_is_widget(self, accel: &str) -> String {
        match self {
            Lang::Es => format!("{accel} ya es el atajo del diario flotante"),
            Lang::En => format!("{accel} is already the shortcut for the floating diary"),
        }
    }

    pub fn shortcut_taken(self, accel: &str) -> String {
        match self {
            Lang::Es => format!("{accel} ya lo usa otra aplicación"),
            Lang::En => format!("{accel} is already used by another app"),
        }
    }
}
