// En la versión instalada no se abre una consola junto a la ventana. NO QUITAR.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    diaryo_lib::run();
}
