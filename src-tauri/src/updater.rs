//! Self-update for the portable installer executable.
//!
//! The app ships as a single standalone `.exe` (no installer), so updating means
//! downloading the new `.exe` and swapping it in. A running executable can't
//! overwrite itself, so we hand the swap to a tiny detached batch helper that
//! waits for this process to exit, replaces the file, relaunches it, and deletes
//! itself. Version discovery uses the non-rate-limited GitHub release redirect.

use crate::download;
use crate::error::{AppError, AppResult};
use crate::github::{self, is_newer};
use crate::ops::{INSTALLER_ASSET, INSTALLER_REPO};
use crate::progress::Reporter;
use serde::Serialize;
use std::fs;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct InstallerUpdate {
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub update_available: bool,
}

pub async fn check_installer_update() -> AppResult<InstallerUpdate> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = github::latest_tag_web(INSTALLER_REPO).await?;
    let download_url = github::asset_download_url(INSTALLER_REPO, &latest, INSTALLER_ASSET);
    Ok(InstallerUpdate {
        update_available: is_newer(&latest, &current),
        latest_version: latest,
        current_version: current,
        download_url,
    })
}

/// Download the new executable and swap it in via a detached helper, then exit.
pub async fn self_update(app: AppHandle, download_url: String, reporter: &Reporter) -> AppResult<()> {
    let current_exe = std::env::current_exe()
        .map_err(|e| AppError::Other(format!("Cannot locate current executable: {e}")))?;

    reporter.progress("Preparing", Some(0.0), "Fetching the latest version...");
    let client = github::client()?;
    let new_exe = download::download_to_temp(
        &client,
        &download_url,
        "SpicetifyInstaller-update.exe",
        "Downloading",
        reporter,
        3,
    )
    .await?;

    reporter.progress("Installing", None, "Applying update...");
    let script = swap_script(&current_exe, &new_exe, std::process::id());
    let script_path = crate::paths::Paths::temp_dir().join("spicetify-installer-update.cmd");
    fs::write(&script_path, script)
        .map_err(|e| AppError::Io(format!("Failed to write update helper: {e}")))?;

    spawn_detached(&script_path)?;

    // Give the helper a moment to start waiting, then quit so it can replace us.
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    reporter.info("Restarting into the new version...");
    app.exit(0);
    Ok(())
}

/// Batch helper: wait for our PID to exit, replace the exe, relaunch, self-delete.
///
/// The replace is retried in a loop: even after the process leaves the task list,
/// the OS (or an antivirus scan) can briefly keep the old `.exe` locked, and a
/// single `move` would fail. `move /y` deletes its source on success, so the
/// absence of `{new}` is our proof the swap landed — we retry until then (bounded
/// to ~30s) and only relaunch afterwards. Errors are logged next to the helper.
fn swap_script(current: &std::path::Path, new: &std::path::Path, pid: u32) -> String {
    format!(
        "@echo off\r\n\
         setlocal enabledelayedexpansion\r\n\
         set \"log=%~dp0spicetify-installer-update.log\"\r\n\
         set /a tries=0\r\n\
         :waitloop\r\n\
         tasklist /fi \"PID eq {pid}\" 2>nul | findstr /i \" {pid} \" >nul\r\n\
         if not errorlevel 1 (\r\n\
           ping -n 2 127.0.0.1 >nul\r\n\
           goto waitloop\r\n\
         )\r\n\
         rem Let the OS release the just-exited executable before overwriting it.\r\n\
         ping -n 3 127.0.0.1 >nul\r\n\
         :movetry\r\n\
         move /y \"{new}\" \"{current}\" >>\"%log%\" 2>&1\r\n\
         if not exist \"{new}\" goto launch\r\n\
         set /a tries+=1\r\n\
         if !tries! lss 30 (\r\n\
           ping -n 2 127.0.0.1 >nul\r\n\
           goto movetry\r\n\
         )\r\n\
         echo Giving up after !tries! attempts; relaunching existing version. >>\"%log%\"\r\n\
         :launch\r\n\
         start \"\" \"{current}\"\r\n\
         del \"%~f0\"\r\n",
        pid = pid,
        new = new.display(),
        current = current.display(),
    )
}

#[cfg(windows)]
fn spawn_detached(script: &std::path::Path) -> AppResult<()> {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW alone: the helper gets an *invisible* console that its
    // child console tools (tasklist/ping/move/start) inherit, so nothing flashes.
    // DETACHED_PROCESS is deliberately NOT used — a detached helper has no console
    // at all, which makes every child allocate its own visible window. Windows
    // does not kill this child when we exit, so it outlives us as required.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("cmd")
        .args(["/c", &script.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| AppError::Other(format!("Failed to start update helper: {e}")))?;
    Ok(())
}

#[cfg(not(windows))]
fn spawn_detached(_script: &std::path::Path) -> AppResult<()> {
    Err(AppError::Other("Self-update is only supported on Windows".into()))
}
