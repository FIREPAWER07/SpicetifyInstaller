//! Direct interaction with the installed `spicetify.exe` — no CMD/PowerShell.

use crate::error::{AppError, AppResult};
use crate::paths::Paths;
use crate::platform;
use crate::progress::Reporter;
use serde::Serialize;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Snapshot of the environment the dashboard renders from.
#[derive(Debug, Serialize)]
pub struct Status {
    pub spicetify_installed: bool,
    pub spicetify_version: Option<String>,
    pub spotify_installed: bool,
    pub spotify_running: bool,
    pub has_backup: bool,
}

/// Build a hidden-window std Command, then hand it to Tokio for async I/O.
fn command(program: &std::path::Path) -> tokio::process::Command {
    let mut std_cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std_cmd.creation_flags(CREATE_NO_WINDOW);
    }
    tokio::process::Command::from(std_cmd)
}

/// Read `spicetify -v` directly from the executable. Returns the trimmed
/// version string (e.g. "2.38.0") or `None` when not installed / unreadable.
pub async fn version() -> Option<String> {
    let exe = Paths::spicetify_exe()?;
    if !exe.exists() {
        return None;
    }
    let output = command(&exe).arg("-v").output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

/// True when at least one Spotify backup exists under the Spicetify config dir.
pub fn has_backup() -> bool {
    // spicetify writes backup metadata into config-xpui.ini / Backup folder.
    if let Some(cfg) = Paths::spicetify_config_dir() {
        if cfg.join("Backup").exists() {
            return true;
        }
    }
    false
}

pub async fn status() -> Status {
    Status {
        spicetify_installed: Paths::spicetify_installed(),
        spicetify_version: version().await,
        spotify_installed: Paths::spotify_installed(),
        spotify_running: platform::process_running("Spotify.exe"),
        has_backup: has_backup(),
    }
}

/// Run `spicetify <args...>`, streaming stdout/stderr to the reporter as log
/// lines. Honors cancellation by killing the child. Errors on non-zero exit.
pub async fn run(args: &[&str], stage: &str, reporter: &Reporter) -> AppResult<()> {
    let exe = Paths::spicetify_exe().ok_or(AppError::NotInstalled)?;
    if !exe.exists() {
        return Err(AppError::NotInstalled);
    }

    reporter.progress(stage, None, format!("Running: spicetify {}", args.join(" ")));
    reporter.info(format!("> spicetify {}", args.join(" ")));

    let mut child = command(&exe)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Command(format!("Failed to start spicetify: {e}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let out_reporter = reporter.clone();
    let out_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    out_reporter.info(strip_ansi(&line));
                }
            }
        }
    });

    let err_reporter = reporter.clone();
    let err_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.trim().is_empty() {
                    err_reporter.warn(strip_ansi(&line));
                }
            }
        }
    });

    let token = reporter.token();
    let status = tokio::select! {
        status = child.wait() => status.map_err(|e| AppError::Command(e.to_string()))?,
        _ = token.cancelled() => {
            let _ = child.kill().await;
            return Err(AppError::Cancelled);
        }
    };

    let _ = out_task.await;
    let _ = err_task.await;

    if status.success() {
        Ok(())
    } else {
        Err(AppError::Command(format!(
            "spicetify {} exited with {}",
            args.join(" "),
            status
        )))
    }
}

/// Remove ANSI escape sequences so logs render cleanly in the UI.
///
/// Operates on Unicode scalar values (not raw bytes) so multi-byte UTF-8
/// characters — Spicetify's ✓, →, box-drawing glyphs, accented text — survive
/// intact instead of being mangled into replacement boxes.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        // ESC sequence. CSI: `ESC [ ... final(0x40..=0x7e)`.
        match chars.peek() {
            Some('[') => {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if ('\u{40}'..='\u{7e}').contains(&nc) {
                        break;
                    }
                }
            }
            // OSC and other escapes: skip the single following byte (best-effort).
            Some(_) => {
                chars.next();
            }
            None => {}
        }
    }
    out
}
