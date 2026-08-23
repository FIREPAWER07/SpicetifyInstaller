use std::path::PathBuf;

/// Resolved, canonical locations Spicetify and Spotify use on Windows.
/// All lookups are native environment-variable reads — no shell invocation.
pub struct Paths;

impl Paths {
    fn env_dir(var: &str) -> Option<PathBuf> {
        std::env::var_os(var).map(PathBuf::from)
    }

    /// `%LOCALAPPDATA%\spicetify`
    pub fn spicetify_dir() -> Option<PathBuf> {
        Self::env_dir("LOCALAPPDATA").map(|p| p.join("spicetify"))
    }

    /// `%LOCALAPPDATA%\spicetify\spicetify.exe`
    pub fn spicetify_exe() -> Option<PathBuf> {
        Self::spicetify_dir().map(|p| p.join("spicetify.exe"))
    }

    /// `%APPDATA%\spicetify` — config, backups, themes, extensions, CustomApps.
    pub fn spicetify_config_dir() -> Option<PathBuf> {
        Self::env_dir("APPDATA").map(|p| p.join("spicetify"))
    }

    /// `%APPDATA%\Spotify` — default Spotify install (non-Store).
    pub fn spotify_dir() -> Option<PathBuf> {
        Self::env_dir("APPDATA").map(|p| p.join("Spotify"))
    }

    pub fn spotify_exe() -> Option<PathBuf> {
        Self::spotify_dir().map(|p| p.join("Spotify.exe"))
    }

    pub fn temp_dir() -> PathBuf {
        std::env::temp_dir()
    }

    pub fn spicetify_installed() -> bool {
        Self::spicetify_exe().map(|p| p.exists()).unwrap_or(false)
    }

    pub fn spotify_installed() -> bool {
        Self::spotify_exe().map(|p| p.exists()).unwrap_or(false)
    }
}
