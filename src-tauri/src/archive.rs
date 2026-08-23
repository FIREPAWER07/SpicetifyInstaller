use crate::error::{AppError, AppResult};
use crate::progress::Reporter;
use std::fs;
use std::path::{Path, PathBuf};

/// Extract a zip archive into `dest`, emitting per-file progress.
///
/// Runs the (synchronous) `zip` work on a blocking thread so the async runtime
/// stays responsive. Guards against Zip-Slip path traversal.
pub async fn extract_zip(
    archive: PathBuf,
    dest: PathBuf,
    stage: String,
    reporter: Reporter,
) -> AppResult<()> {
    tokio::task::spawn_blocking(move || extract_blocking(&archive, &dest, &stage, &reporter))
        .await
        .map_err(|e| AppError::Other(format!("Extraction task panicked: {e}")))?
}

fn extract_blocking(archive: &Path, dest: &Path, stage: &str, reporter: &Reporter) -> AppResult<()> {
    let file = fs::File::open(archive)
        .map_err(|e| AppError::Io(format!("Failed to open archive: {e}")))?;
    let mut zip = zip::ZipArchive::new(file)?;
    let total = zip.len().max(1);

    fs::create_dir_all(dest).map_err(|e| AppError::Io(e.to_string()))?;

    for i in 0..zip.len() {
        if reporter.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let mut entry = zip.by_index(i)?;

        // Zip-Slip protection: only accept safe, in-tree relative paths.
        let out_path = match entry.enclosed_name() {
            Some(p) => dest.join(p),
            None => {
                reporter.warn(format!("Skipping unsafe archive entry: {}", entry.name()));
                continue;
            }
        };

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| AppError::Io(e.to_string()))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
            }
            let mut out = fs::File::create(&out_path)
                .map_err(|e| AppError::Io(format!("Failed to write {}: {e}", out_path.display())))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| AppError::Io(e.to_string()))?;
        }

        let percent = ((i + 1) as f64 / total as f64) * 100.0;
        reporter.progress(stage, Some(percent), format!("Extracting {} of {}", i + 1, total));
    }

    Ok(())
}
