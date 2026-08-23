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

use progress::OpState;

pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    // The self-update flow is handled by Tauri's official updater plugin, which
    // verifies release signatures against the pubkey in tauri.conf.json.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(OpState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::check_spicetify_update,
            commands::cancel_operation,
            commands::is_operation_running,
            commands::install_spicetify,
            commands::backup_spotify,
            commands::repair_spicetify,
            commands::apply_spicetify,
            commands::uninstall_spicetify,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
