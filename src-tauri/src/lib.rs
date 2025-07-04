mod commands;
mod update_manager;

pub use commands::*;
pub use update_manager::*;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::execute_powershell_command,
            commands::check_versions,
            commands::open_faq_url,
            commands::open_download_url,
            commands::check_spicetify_location,
            commands::download_update,
            commands::check_for_app_updates,
            commands::download_and_install_update,
            commands::restart_application
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
