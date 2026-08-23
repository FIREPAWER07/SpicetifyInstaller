use crate::error::{AppError, AppResult};
use crate::progress::Reporter;
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

/// Download `url` to a temp file, streaming with real byte-level progress.
///
/// Robustness:
/// - Downloads to a `.part` file and renames on success (no partial artifacts).
/// - Retries transient failures up to `retries` times with backoff.
/// - Honors cancellation between chunks and cleans up on cancel/error.
/// - Validates the received size against `Content-Length` when present.
pub async fn download_to_temp(
    client: &reqwest::Client,
    url: &str,
    file_name: &str,
    stage: &str,
    reporter: &Reporter,
    retries: u32,
) -> AppResult<PathBuf> {
    let dest = crate::paths::Paths::temp_dir().join(file_name);
    let part = dest.with_extension("part");

    let mut attempt = 0;
    loop {
        match try_download(client, url, &part, stage, reporter).await {
            Ok(()) => {
                let _ = tokio::fs::remove_file(&dest).await;
                tokio::fs::rename(&part, &dest)
                    .await
                    .map_err(|e| AppError::Io(format!("Failed to finalize download: {e}")))?;
                return Ok(dest);
            }
            Err(AppError::Cancelled) => {
                cleanup(&part).await;
                return Err(AppError::Cancelled);
            }
            Err(e) => {
                cleanup(&part).await;
                if attempt >= retries {
                    return Err(e);
                }
                attempt += 1;
                let wait = 1u64 << attempt.min(4); // 2,4,8,16s
                reporter.warn(format!(
                    "Download attempt {attempt} failed: {e}. Retrying in {wait}s..."
                ));
                if wait_or_cancel(reporter, wait).await {
                    return Err(AppError::Cancelled);
                }
            }
        }
    }
}

async fn try_download(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    stage: &str,
    reporter: &Reporter,
) -> AppResult<()> {
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::Download(format!(
            "Server returned status {}",
            resp.status()
        )));
    }

    let total = resp.content_length();
    let mut downloaded: u64 = 0;
    let mut file = tokio::fs::File::create(part)
        .await
        .map_err(|e| AppError::Io(format!("Failed to create temp file: {e}")))?;

    let mut stream = resp.bytes_stream();
    let mut last_emit = 0u64;

    while let Some(chunk) = stream.next().await {
        if reporter.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        let chunk = chunk.map_err(|e| AppError::Download(e.to_string()))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        downloaded += chunk.len() as u64;

        // Throttle event emission to ~every 64 KiB to avoid flooding the UI.
        if downloaded - last_emit >= 64 * 1024 {
            last_emit = downloaded;
            let percent = total.map(|t| (downloaded as f64 / t.max(1) as f64) * 100.0);
            let msg = match total {
                Some(t) => format!("{} / {}", human_bytes(downloaded), human_bytes(t)),
                None => human_bytes(downloaded),
            };
            reporter.progress(stage, percent, msg);
        }
    }

    file.flush().await.map_err(|e| AppError::Io(e.to_string()))?;
    drop(file);

    if let Some(t) = total {
        if downloaded != t {
            return Err(AppError::Download(format!(
                "Incomplete download: got {downloaded} of {t} bytes"
            )));
        }
    }
    if downloaded == 0 {
        return Err(AppError::Download("Downloaded 0 bytes".into()));
    }

    reporter.progress(stage, Some(100.0), format!("Downloaded {}", human_bytes(downloaded)));
    Ok(())
}

async fn cleanup(part: &Path) {
    let _ = tokio::fs::remove_file(part).await;
}

/// Sleep for `secs`, returning true early if cancellation fires.
async fn wait_or_cancel(reporter: &Reporter, secs: u64) -> bool {
    let token = reporter.token();
    tokio::select! {
        _ = tokio::time::sleep(std::time::Duration::from_secs(secs)) => false,
        _ = token.cancelled() => true,
    }
}

pub fn human_bytes(n: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut v = n as f64;
    let mut u = 0;
    while v >= 1024.0 && u < UNITS.len() - 1 {
        v /= 1024.0;
        u += 1;
    }
    if u == 0 {
        format!("{n} B")
    } else {
        format!("{v:.1} {}", UNITS[u])
    }
}
