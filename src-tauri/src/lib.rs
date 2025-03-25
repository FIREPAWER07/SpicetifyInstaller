// Import the commands module
mod commands;

// Re-export the commands for use in main.rs
pub use commands::*;

// Main run function
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::execute_powershell_command,
            commands::check_versions,
            commands::open_faq_url,
            commands::open_download_url,
            commands::check_spicetify_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}