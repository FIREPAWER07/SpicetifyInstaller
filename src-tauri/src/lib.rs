mod archive;
mod commands;
mod download;
mod error;
mod github;
mod ops;
mod paths;
mod platform;
mod progress;
mod spicetify;
mod updater;

use progress::OpState;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(OpState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::check_spicetify_update,
            commands::check_installer_update,
            commands::cancel_operation,
            commands::is_operation_running,
            commands::install_spicetify,
            commands::backup_spotify,
            commands::repair_spicetify,
            commands::apply_spicetify,
            commands::uninstall_spicetify,
            commands::install_installer_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
