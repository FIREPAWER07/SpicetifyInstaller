#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    spicetify_installer_lib::run();
    println!("I CHANGED THIS!");
    tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
