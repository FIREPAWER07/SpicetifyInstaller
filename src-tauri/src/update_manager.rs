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

        // Extract the actual filename from GitHub URL
        let github_filename = download_url
            .split('/')
            .last()
            .ok_or("Could not extract filename from URL")?
            .split('?')
            .next()
            .unwrap_or("installer.exe");

        println!("GitHub filename: {}", github_filename);

        // Create temporary directory for update files
        let temp_dir = env::temp_dir();
        let update_dir = temp_dir.join("spicetify_installer_update");
        
        // Create update directory if it doesn't exist
        if !update_dir.exists() {
            fs::create_dir_all(&update_dir)
                .map_err(|e| format!("Failed to create update directory: {}", e))?;
        }

        let updater_script_path = update_dir.join("updater.ps1");
        let new_installer_path = update_dir.join(github_filename);
        let final_installer_path = current_exe_dir.join(github_filename);
        
        println!("Update directory: {:?}", update_dir);
        println!("Script path: {:?}", updater_script_path);
        println!("New installer path: {:?}", new_installer_path);
        println!("Final installer path: {:?}", final_installer_path);

        self.emit_progress("Downloading", 10, "Downloading new installer...").await;

        // Download the new installer
        let client = reqwest::Client::builder()
            .user_agent("Spicetify-Installer-Updater")
            .timeout(Duration::from_secs(300))
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
            &final_installer_path,
            current_exe_dir,
        )?;

        fs::write(&updater_script_path, updater_script)
            .map_err(|e| {
                let error = format!("Failed to write updater script: {}", e);
                println!("Error: {}", error);
                error
            })?;

        // Create a simple batch file to run the PowerShell script
        let batch_script = format!(r#"@echo off
cd /d "{}"
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "{}"
"#, 
            update_dir.to_string_lossy(),
            updater_script_path.to_string_lossy()
        );

        let batch_path = update_dir.join("run_updater.bat");
        fs::write(&batch_path, batch_script)
            .map_err(|e| format!("Failed to write batch script: {}", e))?;

        println!("Updater script and batch file created");

        self.emit_progress("Executing update", 50, "Starting update process...").await;

        // Execute the batch file which will run the PowerShell script
        let mut cmd = Command::new("cmd");
        cmd.args(&["/c", &batch_path.to_string_lossy()]);

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        println!("Executing updater batch file...");

        cmd.spawn()
            .map_err(|e| {
                let error = format!("Failed to start updater: {}", e);
                println!("Error: {}", error);
                error
            })?;

        self.emit_progress("Completing", 90, "Update process started. Application will restart...").await;

        println!("Updater started, waiting before exit...");

        // Give the updater more time to start
        tokio::time::sleep(Duration::from_millis(3000)).await;

        println!("Exiting application for update...");

        // Exit the current application
        self.app_handle.exit(0);

        Ok(())
    }

    fn create_updater_script(
        &self,
        current_exe: &PathBuf,
        new_installer: &PathBuf,
        final_installer: &PathBuf,
        install_dir: &std::path::Path,
    ) -> Result<String, String> {
    let script = format!(r#"
# Spicetify Installer Auto-Updater Script
# Downloads latest version and installs with GitHub filename

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

# Configuration
$CurrentInstaller = "{}"
$NewInstaller = "{}"
$FinalInstaller = "{}"
$InstallDirectory = "{}"
$BackupPath = "$env:TEMP\spicetify_installer_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').exe"
$LogFile = "$env:TEMP\spicetify_updater_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

# Logging function
function Write-Log {{
    param($Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "$Timestamp - $Message"
    $LogEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $LogEntry
}}

try {{
    Write-Log "=== Starting Update Process ==="
    Write-Log "Current installer: $CurrentInstaller"
    Write-Log "New installer: $NewInstaller"
    Write-Log "Final installer: $FinalInstaller"
    Write-Log "Install directory: $InstallDirectory"

    # Wait for current application to close
    Write-Log "Waiting for application to close..."
    $ProcessName = [System.IO.Path]::GetFileNameWithoutExtension($CurrentInstaller)
    
    $WaitCount = 0
    while ((Get-Process -Name $ProcessName -ErrorAction SilentlyContinue) -and ($WaitCount -lt 30)) {{
        Start-Sleep -Seconds 1
        $WaitCount++
    }}

    if ($WaitCount -ge 30) {{
        Write-Log "Forcing application closure..."
        Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 2
    }}

    # Verify new installer exists
    if (-not (Test-Path $NewInstaller)) {{
        throw "New installer not found: $NewInstaller"
    }}

    $NewSize = (Get-Item $NewInstaller).Length
    Write-Log "New installer size: $NewSize bytes"

    # Create backup of current installer
    if (Test-Path $CurrentInstaller) {{
        Write-Log "Creating backup of current installer..."
        Copy-Item -Path $CurrentInstaller -Destination $BackupPath -Force
        Write-Log "Backup created: $BackupPath"
    }}

    # Install new version with GitHub filename
    Write-Log "Installing new version with GitHub filename..."
    Copy-Item -Path $NewInstaller -Destination $FinalInstaller -Force

    # Verify installation
    if (Test-Path $FinalInstaller) {{
        $FinalSize = (Get-Item $FinalInstaller).Length
        if ($FinalSize -eq $NewSize) {{
            Write-Log "New version installed successfully! Size: $FinalSize bytes"
        }} else {{
            throw "Size mismatch after installation"
        }}
    }} else {{
        throw "New installer not found after installation"
    }}

    # Remove old version if it's different from new one
    if ((Test-Path $CurrentInstaller) -and ($CurrentInstaller -ne $FinalInstaller)) {{
        Write-Log "Removing old version: $CurrentInstaller"
        Remove-Item -Path $CurrentInstaller -Force -ErrorAction SilentlyContinue
        Write-Log "Old version removed"
    }}

    # Clean up temporary file
    Remove-Item -Path $NewInstaller -Force -ErrorAction SilentlyContinue

    # Start new version BEFORE cleanup
    Write-Log "Starting new version: $FinalInstaller"
    $NewProcess = Start-Process -FilePath $FinalInstaller -WorkingDirectory $InstallDirectory -PassThru
    
    if ($NewProcess) {{
        Write-Log "New version started successfully (PID: $($NewProcess.Id))"
        
        # Wait a moment to ensure the new process is stable
        Start-Sleep -Seconds 2
        
        # Verify the new process is still running
        if (Get-Process -Id $NewProcess.Id -ErrorAction SilentlyContinue) {{
            Write-Log "New version is running successfully"
        }} else {{
            Write-Log "Warning: New version process may have exited"
        }}
    }} else {{
        Write-Log "Warning: Failed to get process information for new version"
    }}

    Write-Log "=== Update completed successfully! ==="
    Write-Log "New version is now running with GitHub filename"

}}
catch {{
    Write-Log "=== Update failed: $($_.Exception.Message) ==="
    
    # Restore backup if available and new version failed
    if ((Test-Path $BackupPath) -and (-not (Test-Path $FinalInstaller) -or (Get-Item $FinalInstaller).Length -eq 0)) {{
        Write-Log "Restoring backup..."
        Copy-Item -Path $BackupPath -Destination $CurrentInstaller -Force
        Write-Log "Backup restored"
        
        # Start the restored version
        Write-Log "Starting restored version..."
        Start-Process -FilePath $CurrentInstaller -WorkingDirectory $InstallDirectory
    }}
    
    exit 1
}}

# Clean up AFTER starting the new version
Write-Log "Cleaning up update files..."
Start-Sleep -Seconds 3

# Clean up the update directory
try {{
    $UpdateDir = Split-Path -Parent $PSCommandPath
    Write-Log "Removing update directory: $UpdateDir"
    Start-Sleep -Seconds 1
    Remove-Item -Path $UpdateDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Log "Update directory cleaned up"
}}
catch {{
    Write-Log "Note: Update directory cleanup failed, but this is not critical"
}}

Write-Log "Update script completed successfully"
exit 0
"#,
        current_exe.to_string_lossy().replace('\\', "\\\\"),
        new_installer.to_string_lossy().replace('\\', "\\\\"),
        final_installer.to_string_lossy().replace('\\', "\\\\"),
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
