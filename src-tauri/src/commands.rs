//! Tauri command surface. Thin wrappers around `ops`/`updater` that enforce a
//! single concurrent operation and wire up progress reporting + cancellation.

use crate::error::{AppError, AppResult};
use crate::ops::{self, SpicetifyUpdate};
use crate::progress::{OpState, Reporter};
use crate::spicetify::{self, Status};
use crate::updater::{self, InstallerUpdate};
use std::future::Future;
use tauri::{AppHandle, State};

/// Run a long operation under the single-operation guard, providing a Reporter
/// bound to a fresh cancellation token. Rejects if another op is in flight.
async fn guarded<F, Fut>(app: AppHandle, state: State<'_, OpState>, f: F) -> AppResult<String>
where
    F: FnOnce(Reporter) -> Fut,
    Fut: Future<Output = AppResult<String>>,
{
    let token = state
        .begin()
        .ok_or_else(|| AppError::Other("Another operation is already running".into()))?;
    let reporter = Reporter::new(app, token);
    let result = f(reporter).await;
    state.finish();
    result
}

#[tauri::command]
pub async fn get_status() -> Status {
    spicetify::status().await
}

#[tauri::command]
pub async fn check_spicetify_update() -> AppResult<SpicetifyUpdate> {
    ops::check_spicetify_update().await
}

#[tauri::command]
pub async fn check_installer_update() -> AppResult<InstallerUpdate> {
    updater::check_installer_update().await
}

#[tauri::command]
pub fn cancel_operation(state: State<'_, OpState>) {
    state.cancel();
}

#[tauri::command]
pub fn is_operation_running(state: State<'_, OpState>) -> bool {
    state.is_running()
}

#[tauri::command]
pub async fn install_spicetify(
    app: AppHandle,
    state: State<'_, OpState>,
    marketplace: bool,
) -> AppResult<String> {
    guarded(app, state, |r| async move { ops::install(marketplace, &r).await }).await
}

#[tauri::command]
pub async fn backup_spotify(app: AppHandle, state: State<'_, OpState>) -> AppResult<String> {
    guarded(app, state, |r| async move { ops::backup(&r).await }).await
}

#[tauri::command]
pub async fn repair_spicetify(app: AppHandle, state: State<'_, OpState>) -> AppResult<String> {
    guarded(app, state, |r| async move { ops::repair(&r).await }).await
}

#[tauri::command]
pub async fn apply_spicetify(app: AppHandle, state: State<'_, OpState>) -> AppResult<String> {
    guarded(app, state, |r| async move { ops::apply(&r).await }).await
}

#[tauri::command]
pub async fn uninstall_spicetify(app: AppHandle, state: State<'_, OpState>) -> AppResult<String> {
    guarded(app, state, |r| async move { ops::uninstall(&r).await }).await
}

#[tauri::command]
pub async fn install_installer_update(
    app: AppHandle,
    state: State<'_, OpState>,
    download_url: String,
) -> AppResult<String> {
    guarded(app, state, |r| async move {
        updater::self_update(r.app_handle(), download_url, &r).await?;
        Ok("Update started".into())
    })
    .await
}

