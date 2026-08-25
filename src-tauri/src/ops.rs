//! High-level Spicetify workflows composed from the native building blocks
//! (download, extract, PATH, direct exe calls). Each returns a friendly summary
//! and streams real progress + logs; all honor cancellation.

use crate::archive;
use crate::download;
use crate::error::{AppError, AppResult};
use crate::github::{self, is_newer};
use crate::paths::Paths;
use crate::platform;
use crate::progress::Reporter;
use crate::spicetify;

pub const SPICETIFY_REPO: &str = "spicetify/cli";
pub const MARKETPLACE_REPO: &str = "spicetify/marketplace";
pub const INSTALLER_REPO: &str = "FIREPAWER07/SpicetifyInstaller";
/// Fixed asset name for the portable installer executable in each release.
pub const INSTALLER_ASSET: &str = "SpicetifyInstaller.exe";

/// Install or update Spicetify natively:
/// download the arch-matched release zip, extract into `%LOCALAPPDATA%\spicetify`,
/// register it on PATH, verify, and optionally add the Marketplace.
pub async fn install(marketplace: bool, reporter: &Reporter) -> AppResult<String> {
    reporter.progress("Preparing", Some(0.0), "Contacting GitHub...");
    let client = github::client()?;

    // Resolve the latest version + download URL WITHOUT the rate-limited API:
    // follow the `releases/latest` web redirect and build the asset URL by
    // convention. Fall back to the API only if the web path fails.
    let (version, download_url) = match github::latest_tag_web(SPICETIFY_REPO).await {
        Ok(v) => {
            let asset = format!("spicetify-{v}-windows-{}.zip", github::target_arch());
            (v.clone(), github::asset_download_url(SPICETIFY_REPO, &v, &asset))
        }
        Err(e) => {
            reporter.warn(format!("Fast version check failed ({e}); trying GitHub API..."));
            let release = github::latest_release(&client, SPICETIFY_REPO).await?;
            let asset = release.spicetify_archive().ok_or_else(|| {
                AppError::Other(format!(
                    "No Windows {} build found in the latest Spicetify release",
                    github::target_arch()
                ))
            })?;
            (release.version.clone(), asset.url.clone())
        }
    };
    reporter.info(format!("Latest Spicetify: v{version}"));

    check_cancel(reporter)?;

    let archive_path = download::download_to_temp(
        &client,
        &download_url,
        "spicetify.zip",
        "Downloading",
        reporter,
        3,
    )
    .await?;

    check_cancel(reporter)?;

    let dir = Paths::spicetify_dir().ok_or_else(|| AppError::Other("LOCALAPPDATA not set".into()))?;
    reporter.progress("Extracting", Some(0.0), "Unpacking Spicetify...");
    archive::extract_zip(
        archive_path.clone(),
        dir.clone(),
        "Extracting".into(),
        reporter.clone(),
    )
    .await?;
    let _ = tokio::fs::remove_file(&archive_path).await;

    reporter.progress("Configuring", None, "Registering Spicetify on PATH...");
    match platform::add_to_user_path(&dir) {
        Ok(true) => reporter.info("Added Spicetify to your user PATH"),
        Ok(false) => reporter.info("PATH already contains Spicetify"),
        Err(e) => reporter.warn(format!("Could not update PATH automatically: {e}")),
    }

    reporter.progress("Verifying", None, "Checking installation...");
    let version = spicetify::version()
        .await
        .ok_or_else(|| AppError::Other("Spicetify executable missing after install".into()))?;
    reporter.info(format!("Verified spicetify.exe reports v{version}"));

    // Apply Spicetify to Spotify. Restore first (best-effort — there's no backup
    // on a first install) so the backup captures a vanilla Spotify, then
    // backup + apply. This also refreshes Spicetify's preprocessed data, which
    // otherwise leaves the Marketplace's apply failing with "data is outdated".
    reporter.progress("Applying", None, "Applying Spicetify to Spotify...");
    if let Err(e) = spicetify::run(&["restore"], "Applying", reporter).await {
        reporter.info(format!("Restore skipped: {e}"));
    }
    check_cancel(reporter)?;
    if let Err(e) = spicetify::run(&["backup", "apply"], "Applying", reporter).await {
        reporter.warn(format!(
            "Automatic apply failed: {e}. Use Repair if Spotify looks unchanged."
        ));
    }

    if marketplace {
        if let Err(e) = install_marketplace(&client, reporter).await {
            reporter.warn(format!("Marketplace step skipped: {e}"));
        }
    }

    reporter.progress("Done", Some(100.0), "Spicetify is ready");
    Ok(format!("Spicetify v{version} installed successfully"))
}

/// Add the Spicetify Marketplace as a custom app (best-effort, non-fatal).
async fn install_marketplace(client: &reqwest::Client, reporter: &Reporter) -> AppResult<()> {
    reporter.progress("Marketplace", None, "Fetching Marketplace...");
    let release = github::latest_release(client, MARKETPLACE_REPO).await?;
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.to_ascii_lowercase().ends_with(".zip"))
        .ok_or_else(|| AppError::Other("No Marketplace archive published".into()))?;

    let zip = download::download_to_temp(
        client,
        &asset.url,
        "marketplace.zip",
        "Marketplace",
        reporter,
        2,
    )
    .await?;

    let custom_apps = Paths::spicetify_config_dir()
        .ok_or_else(|| AppError::Other("APPDATA not set".into()))?
        .join("CustomApps")
        .join("marketplace");
    archive::extract_zip(
        zip.clone(),
        custom_apps,
        "Marketplace".into(),
        reporter.clone(),
    )
    .await?;
    let _ = tokio::fs::remove_file(&zip).await;

    spicetify::run(&["config", "custom_apps", "marketplace"], "Marketplace", reporter).await?;
    spicetify::run(&["apply"], "Marketplace", reporter).await?;
    reporter.info("Marketplace installed");
    Ok(())
}

/// Create a fresh backup of the current Spotify state.
pub async fn backup(reporter: &Reporter) -> AppResult<String> {
    ensure_installed()?;
    spicetify::run(&["backup"], "Backing up", reporter).await?;
    Ok("Backup created".into())
}

/// Repair a broken install: restore, back up, then re-apply.
pub async fn repair(reporter: &Reporter) -> AppResult<String> {
    ensure_installed()?;

    reporter.progress("Repairing", None, "Restoring Spotify...");
    if let Err(e) = spicetify::run(&["restore"], "Repairing", reporter).await {
        // No backup yet is fine; keep going.
        reporter.warn(format!("Restore skipped: {e}"));
    }
    check_cancel(reporter)?;

    reporter.progress("Repairing", None, "Creating backup...");
    spicetify::run(&["backup"], "Repairing", reporter).await?;
    check_cancel(reporter)?;

    reporter.progress("Repairing", None, "Applying Spicetify...");
    spicetify::run(&["apply"], "Repairing", reporter).await?;

    Ok("Repair completed".into())
}

/// Re-apply Spicetify to Spotify. Uses `backup apply` so a fresh backup is taken
/// first — this is what Spicetify itself recommends after a Spotify update, and
/// avoids the "Spotify version and backup version are mismatched" warning.
pub async fn apply(reporter: &Reporter) -> AppResult<String> {
    ensure_installed()?;
    spicetify::run(&["backup", "apply"], "Applying", reporter).await?;
    Ok("Spicetify applied".into())
}

/// Fully remove Spicetify: restore Spotify, delete install + config dirs,
/// and drop the PATH entry. Native filesystem removal — no scripts.
pub async fn uninstall(reporter: &Reporter) -> AppResult<String> {
    reporter.progress("Uninstalling", None, "Restoring Spotify...");
    if Paths::spicetify_installed() {
        if let Err(e) = spicetify::run(&["restore"], "Uninstalling", reporter).await {
            reporter.warn(format!("Restore skipped: {e}"));
        }
    }
    check_cancel(reporter)?;

    if let Some(dir) = Paths::spicetify_dir() {
        reporter.progress("Uninstalling", None, "Removing program files...");
        remove_dir(&dir, reporter).await;
        let _ = platform::remove_from_user_path(&dir);
    }
    if let Some(cfg) = Paths::spicetify_config_dir() {
        reporter.progress("Uninstalling", None, "Removing configuration...");
        remove_dir(&cfg, reporter).await;
    }

    reporter.progress("Done", Some(100.0), "Spicetify removed");
    Ok("Spicetify has been completely uninstalled".into())
}

async fn remove_dir(dir: &std::path::Path, reporter: &Reporter) {
    if dir.exists() {
        match tokio::fs::remove_dir_all(dir).await {
            Ok(_) => reporter.info(format!("Removed {}", dir.display())),
            Err(e) => reporter.warn(format!("Could not remove {}: {e}", dir.display())),
        }
    }
}

fn ensure_installed() -> AppResult<()> {
    if Paths::spicetify_installed() {
        Ok(())
    } else {
        Err(AppError::NotInstalled)
    }
}

fn check_cancel(reporter: &Reporter) -> AppResult<()> {
    if reporter.is_cancelled() {
        Err(AppError::Cancelled)
    } else {
        Ok(())
    }
}

// ---- Update availability -----------------------------------------------------

#[derive(serde::Serialize)]
pub struct SpicetifyUpdate {
    pub current_version: Option<String>,
    pub latest_version: String,
    pub update_available: bool,
}

pub async fn check_spicetify_update() -> AppResult<SpicetifyUpdate> {
    // Prefer the non-rate-limited web redirect; fall back to the API.
    let latest = match github::latest_tag_web(SPICETIFY_REPO).await {
        Ok(v) => v,
        Err(_) => {
            let client = github::client()?;
            github::latest_release(&client, SPICETIFY_REPO).await?.version
        }
    };
    let current = spicetify::version().await;
    let update_available = match &current {
        Some(c) => is_newer(&latest, c),
        None => false,
    };
    Ok(SpicetifyUpdate {
        current_version: current,
        latest_version: latest,
        update_available,
    })
}
