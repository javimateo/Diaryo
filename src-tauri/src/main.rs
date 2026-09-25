// The installed build doesn't open a console next to the window. DO NOT REMOVE.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    diaryo_lib::run();
}
