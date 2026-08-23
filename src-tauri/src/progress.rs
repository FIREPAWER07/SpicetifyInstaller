use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

/// Event name for structured progress updates (stage + optional percent).
pub const EVENT_PROGRESS: &str = "op:progress";
/// Event name for streamed log lines (advanced/technical view).
pub const EVENT_LOG: &str = "op:log";

#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    /// High-level stage label, e.g. "Downloading", "Extracting", "Applying".
    pub stage: String,
    /// 0.0–100.0 when known; `None` renders as an indeterminate bar.
    pub percent: Option<f64>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogLine {
    /// "info" | "warn" | "error"
    pub level: String,
    pub line: String,
}

/// Thin wrapper that emits typed progress/log events for a single operation and
/// carries the cancellation token so long-running steps can bail out promptly.
#[derive(Clone)]
pub struct Reporter {
    app: AppHandle,
    token: CancellationToken,
}

impl Reporter {
    pub fn new(app: AppHandle, token: CancellationToken) -> Self {
        Self { app, token }
    }

    pub fn token(&self) -> CancellationToken {
        self.token.clone()
    }

    pub fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }

    pub fn progress(&self, stage: &str, percent: Option<f64>, message: impl Into<String>) {
        let _ = self.app.emit(
            EVENT_PROGRESS,
            Progress {
                stage: stage.to_string(),
                percent,
                message: message.into(),
            },
        );
    }

    pub fn log(&self, level: &str, line: impl Into<String>) {
        let _ = self.app.emit(
            EVENT_LOG,
            LogLine {
                level: level.to_string(),
                line: line.into(),
            },
        );
    }

    pub fn info(&self, line: impl Into<String>) {
        self.log("info", line);
    }
    pub fn warn(&self, line: impl Into<String>) {
        self.log("warn", line);
    }
}

/// Application state: guards against concurrent operations and holds the active
/// cancellation token so a `cancel_operation` command can abort the current run.
#[derive(Default)]
pub struct OpState {
    inner: Mutex<Option<CancellationToken>>,
}

impl OpState {
    /// Begin a new operation. Returns `None` if one is already running.
    pub fn begin(&self) -> Option<CancellationToken> {
        let mut guard = self.inner.lock().unwrap();
        if guard.is_some() {
            return None;
        }
        let token = CancellationToken::new();
        *guard = Some(token.clone());
        Some(token)
    }

    pub fn finish(&self) {
        *self.inner.lock().unwrap() = None;
    }

    pub fn cancel(&self) {
        if let Some(token) = self.inner.lock().unwrap().as_ref() {
            token.cancel();
        }
    }

    pub fn is_running(&self) -> bool {
        self.inner.lock().unwrap().is_some()
    }
}
