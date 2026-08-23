use serde::Serialize;

/// Errors surfaced to the frontend. Serializes to a tagged JSON object so the UI
/// can show a friendly message and, optionally, a machine-readable `kind`.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Operation was cancelled")]
    Cancelled,

    #[error("Network error: {0}")]
    Network(String),

    #[error("Download failed: {0}")]
    Download(String),

    #[error("Filesystem error: {0}")]
    Io(String),

    #[error("Archive error: {0}")]
    Archive(String),

    #[error("Spicetify is not installed")]
    NotInstalled,

    #[error("{0}")]
    Command(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    /// Stable machine-readable tag for the frontend.
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::Cancelled => "cancelled",
            AppError::Network(_) => "network",
            AppError::Download(_) => "download",
            AppError::Io(_) => "io",
            AppError::Archive(_) => "archive",
            AppError::NotInstalled => "not_installed",
            AppError::Command(_) => "command",
            AppError::Other(_) => "other",
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Network(e.to_string())
    }
}

impl From<zip::result::ZipError> for AppError {
    fn from(e: zip::result::ZipError) -> Self {
        AppError::Archive(e.to_string())
    }
}

/// Serialize as `{ "kind": "network", "message": "..." }` for structured handling
/// in the UI while remaining readable when stringified.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
