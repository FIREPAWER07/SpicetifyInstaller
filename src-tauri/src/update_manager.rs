use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};
use tokio::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub update_available: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub stage: String,
    pub progress: u32,
    pub message: String,
}

pub struct UpdateManager {
    app_handle: AppHandle,
}

impl UpdateManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    pub async fn check_for_updates(&self) -> Result<UpdateInfo, String> {
        let current_version = env!("CARGO_PKG_VERSION").to_string();
        
        // Fetch latest release from GitHub
        let client = reqwest::Client::builder()
            .user_agent("Spicetify-Installer-Updater")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get("https://api.github.com/repos/FIREPAWER07/SpicetifyInstaller/releases/latest")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch latest release: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API returned status: {}", response.status()));
        }

        let release_info: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let latest_version = release_info["tag_name"]
            .as_str()
            .ok_or("Missing tag_name")?
            .trim_start_matches('v')
            .to_string();

        // Find Windows executable asset
        let assets = release_info["assets"].as_array().ok_or("Missing assets")?;
        let mut download_url = String::new();

        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if name.ends_with(".exe") || name.contains("setup") || name.contains("installer") {
                download_url = asset["browser_download_url"]
                    .as_str()
                    .ok_or("Missing download URL")?
                    .to_string();
                break;
            }
        }

        if download_url.is_empty() {
            return Err("No suitable installer found in release assets".to_string());
        }

        let update_available = self.is_version_newer(&latest_version, &current_version);

        Ok(UpdateInfo {
            current_version,
            latest_version,
            download_url,
            update_available,
        })
    }

    pub async fn download_and_install_update(&self, download_url: String) -> Result<(), String> {
        println!("Starting update process with URL: {}", download_url);
        self.emit_progress("Preparing update", 0, "Initializing update process...").await;

        // Get current executable path
        let current_exe = env::current_exe()
            .map_err(|e| {
                let error = format!("Failed to get current executable path: {}", e);
                println!("Error: {}", error);
                error
            })?;

        println!("Current executable path: {:?}", current_exe);

        let current_exe_dir = current_exe.parent()
            .ok_or_else(|| {
                let error = "Failed to get executable directory".to_string();
                println!("Error: {}", error);
                error
            })?;

        // Create temporary updater script
        let temp_dir = env::temp_dir();
        let updater_script_path = temp_dir.join("spicetify_installer_updater.ps1");
        let new_installer_path = temp_dir.join("spicetify_installer_new.exe");

        println!("Temp directory: {:?}", temp_dir);
        println!("Script path: {:?}", updater_script_path);
        println!("New installer path: {:?}", new_installer_path);

        self.emit_progress("Downloading", 10, "Downloading new installer...").await;

        // Download the new installer
        let client = reqwest::Client::builder()
            .user_agent("Spicetify-Installer-Updater")
            .timeout(Duration::from_secs(300)) // 5 minute timeout
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        println!("Starting download from: {}", download_url);
        
        let response = client.get(&download_url).send().await
            .map_err(|e| {
                let error = format!("Failed to download update: {}", e);
                println!("Download error: {}", error);
                error
            })?;

        if !response.status().is_success() {
            let error = format!("Download failed with status: {}", response.status());
            println!("Error: {}", error);
            return Err(error);
        }

        println!("Download response received, reading content...");

        let content = response.bytes().await
            .map_err(|e| {
                let error = format!("Failed to read download content: {}", e);
                println!("Error: {}", error);
                error
            })?;

        println!("Downloaded {} bytes", content.len());

        if content.len() < 1024 * 1024 { // Less than 1MB seems suspicious
            let error = format!("Downloaded file seems too small: {} bytes", content.len());
            println!("Warning: {}", error);
        }

        fs::write(&new_installer_path, content)
            .map_err(|e| {
                let error = format!("Failed to write installer: {}", e);
                println!("Error: {}", error);
                error
            })?;

        println!("New installer written to disk");

        self.emit_progress("Creating updater", 30, "Creating update script...").await;

        // Create the PowerShell updater script
        let updater_script = self.create_updater_script(
            &current_exe,
            &new_installer_path,
            current_exe_dir,
        )?;

        fs::write(&updater_script_path, updater_script)
            .map_err(|e| {
                let error = format!("Failed to write updater script: {}", e);
                println!("Error: {}", error);
                error
            })?;

        println!("Updater script created");

        self.emit_progress("Executing update", 50, "Starting update process...").await;

        // Execute the updater script
        let mut cmd = Command::new("powershell");
        cmd.args(&[
            "-ExecutionPolicy", "Bypass",
            "-WindowStyle", "Hidden",
            "-File", &updater_script_path.to_string_lossy()
        ]);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        println!("Executing updater script...");

        cmd.spawn()
            .map_err(|e| {
                let error = format!("Failed to start updater: {}", e);
                println!("Error: {}", error);
                error
            })?;

        self.emit_progress("Completing", 90, "Update process started. Application will restart...").await;

        println!("Updater started, waiting before exit...");

        // Give the updater a moment to start
        tokio::time::sleep(Duration::from_millis(2000)).await;

        println!("Exiting application for update...");

        // Exit the current application
        self.app_handle.exit(0);

        Ok(())
    }

    fn create_updater_script(
        &self,
        current_exe: &PathBuf,
        new_installer: &PathBuf,
        install_dir: &std::path::Path,
    ) -> Result<String, String> {
        let script = format!(r#"
# Spicetify Installer Auto-Updater Script
# This script will replace the current installer with the new version

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Configuration
$CurrentInstaller = "{}"
$NewInstaller = "{}"
$InstallDirectory = "{}"
$BackupPath = "$env:TEMP\spicetify_installer_backup.exe"
$LogFile = "$env:TEMP\spicetify_updater.log"

# Logging function
function Write-Log {{
    param($Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$Timestamp - $Message" | Out-File -FilePath $LogFile -Append
    Write-Host $Message
}}

try {{
    Write-Log "Starting Spicetify Installer update process..."
    Write-Log "Current installer: $CurrentInstaller"
    Write-Log "New installer: $NewInstaller"
    Write-Log "Install directory: $InstallDirectory"

    # Wait for the current application to close
    Write-Log "Waiting for current application to close..."
    $ProcessName = [System.IO.Path]::GetFileNameWithoutExtension($CurrentInstaller)
    
    $WaitCount = 0
    while ((Get-Process -Name $ProcessName -ErrorAction SilentlyContinue) -and ($WaitCount -lt 30)) {{
        Start-Sleep -Seconds 1
        $WaitCount++
    }}

    if ($WaitCount -ge 30) {{
        Write-Log "Warning: Application may still be running. Proceeding anyway..."
    }}

    # Additional wait to ensure file handles are released
    Start-Sleep -Seconds 2

    # Verify new installer exists and is valid
    if (-not (Test-Path $NewInstaller)) {{
        throw "New installer not found at: $NewInstaller"
    }}

    $NewInstallerSize = (Get-Item $NewInstaller).Length
    if ($NewInstallerSize -lt 1MB) {{
        throw "New installer appears to be invalid (size: $NewInstallerSize bytes)"
    }}

    Write-Log "New installer verified (size: $NewInstallerSize bytes)"

    # Create backup of current installer
    if (Test-Path $CurrentInstaller) {{
        Write-Log "Creating backup of current installer..."
        Copy-Item -Path $CurrentInstaller -Destination $BackupPath -Force
        Write-Log "Backup created at: $BackupPath"
    }}

    # Replace the current installer
    Write-Log "Replacing current installer..."
    
    # Try multiple times in case of file locking issues
    $ReplaceAttempts = 0
    $ReplaceSuccess = $false
    
    while ((-not $ReplaceSuccess) -and ($ReplaceAttempts -lt 5)) {{
        try {{
            Copy-Item -Path $NewInstaller -Destination $CurrentInstaller -Force
            $ReplaceSuccess = $true
            Write-Log "Installer replaced successfully"
        }}
        catch {{
            $ReplaceAttempts++
            Write-Log "Replace attempt $ReplaceAttempts failed: $($_.Exception.Message)"
            if ($ReplaceAttempts -lt 5) {{
                Start-Sleep -Seconds 2
            }}
        }}
    }}

    if (-not $ReplaceSuccess) {{
        throw "Failed to replace installer after 5 attempts"
    }}

    # Verify the replacement was successful
    if (-not (Test-Path $CurrentInstaller)) {{
        throw "Installer replacement failed - file not found"
    }}

    $ReplacedSize = (Get-Item $CurrentInstaller).Length
    if ($ReplacedSize -ne $NewInstallerSize) {{
        Write-Log "Warning: Size mismatch after replacement (expected: $NewInstallerSize, actual: $ReplacedSize)"
    }}

    # Clean up temporary files
    Write-Log "Cleaning up temporary files..."
    if (Test-Path $NewInstaller) {{
        Remove-Item -Path $NewInstaller -Force -ErrorAction SilentlyContinue
    }}

    # Start the updated installer
    Write-Log "Starting updated installer..."
    Start-Process -FilePath $CurrentInstaller -WorkingDirectory $InstallDirectory

    Write-Log "Update completed successfully!"

    # Clean up this script after a delay
    Start-Sleep -Seconds 3
    Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue

}}
catch {{
    Write-Log "ERROR: $($_.Exception.Message)"
    
    # Attempt to restore backup if replacement failed
    if ((Test-Path $BackupPath) -and (-not (Test-Path $CurrentInstaller))) {{
        Write-Log "Attempting to restore backup..."
        try {{
            Copy-Item -Path $BackupPath -Destination $CurrentInstaller -Force
            Write-Log "Backup restored successfully"
        }}
        catch {{
            Write-Log "Failed to restore backup: $($_.Exception.Message)"
        }}
    }}
    
    # Show error message to user
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "Update failed: $($_.Exception.Message)`n`nPlease check the log file at: $LogFile`n`nYou may need to manually download the update.",
        "Spicetify Installer Update Error",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    
    exit 1
}}
"#,
            current_exe.to_string_lossy().replace('\\', "\\\\"),
            new_installer.to_string_lossy().replace('\\', "\\\\"),
            install_dir.to_string_lossy().replace('\\', "\\\\")
        );

        Ok(script)
    }

    async fn emit_progress(&self, stage: &str, progress: u32, message: &str) {
        let update_progress = UpdateProgress {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
        };

        let _ = self.app_handle.emit("update_progress", &update_progress);
    }

    fn is_version_newer(&self, latest: &str, current: &str) -> bool {
        // Simple version comparison - you might want to use a proper semver library
        let latest_parts: Vec<u32> = latest.split('.')
            .filter_map(|s| s.parse().ok())
            .collect();
        let current_parts: Vec<u32> = current.split('.')
            .filter_map(|s| s.parse().ok())
            .collect();

        for i in 0..std::cmp::max(latest_parts.len(), current_parts.len()) {
            let latest_part = latest_parts.get(i).unwrap_or(&0);
            let current_part = current_parts.get(i).unwrap_or(&0);

            if latest_part > current_part {
                return true;
            } else if latest_part < current_part {
                return false;
            }
        }

        false
    }
}
