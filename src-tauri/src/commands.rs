use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;
use tauri::{AppHandle, Emitter};
use tokio::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionInfo {
    #[serde(rename = "installerVersion")]
    pub installer_version: String,
    #[serde(rename = "spicetifyVersion")]
    pub spicetify_version: Option<String>,
    #[serde(rename = "hasInstallerUpdate")]
    pub has_installer_update: bool,
    #[serde(rename = "hasSpicetifyUpdate")]
    pub has_spicetify_update: bool,
    #[serde(rename = "latestInstallerVersion")]
    pub latest_installer_version: Option<String>,
    #[serde(rename = "latestInstallerUrl")]
    pub latest_installer_url: Option<String>,
}

use std::sync::atomic::{AtomicBool, Ordering};
static CHECKING_UPDATES: AtomicBool = AtomicBool::new(false);

// Replace the check_github_release function with this implementation that actually fetches from GitHub
async fn check_github_release() -> Result<(String, String), String> {
    println!("Checking for latest release on GitHub...");

    // Create a client with appropriate headers for GitHub API
    let client = reqwest::Client::builder()
        .user_agent("Spicetify-Installer")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Fetch the latest release information from GitHub API
    let response = client
        .get("https://api.github.com/repos/FIREPAWER07/SpicetifyInstaller/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API returned status code: {}",
            response.status()
        ));
    }

    let release_info: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    // Extract the tag name (version) and download URL
    let tag_name = release_info["tag_name"]
        .as_str()
        .ok_or("Missing tag_name in GitHub response")?
        .to_string();

    // Find the Windows asset URL
    let assets = release_info["assets"]
        .as_array()
        .ok_or("Missing assets in GitHub response")?;
    let mut download_url = String::new();

    for asset in assets {
        let name = asset["name"].as_str().unwrap_or("");
        if name.ends_with(".exe") || name.contains("setup") {
            download_url = asset["browser_download_url"]
                .as_str()
                .ok_or("Missing download URL")?
                .to_string();
            break;
        }
    }

    // If no specific asset was found, use the general release URL
    if download_url.is_empty() {
        download_url = release_info["html_url"]
            .as_str()
            .ok_or("Missing release URL")?
            .to_string();
    }

    println!(
        "Found latest version: {} with URL: {}",
        tag_name, download_url
    );
    Ok((tag_name.trim_start_matches('v').to_string(), download_url))
}

#[tauri::command]
pub async fn execute_powershell_command(
    command: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    println!("Executing PowerShell command: {}", command);

    if command.contains("spicetify-cli/master/install.ps1") {
        return install_spicetify_direct(app_handle).await;
    }

    // Check for specific commands and route them to specialized handlers
    if command.contains("spicetify restore") && command.contains("Remove-Item") {
        return execute_uninstall_command(app_handle).await;
    } else if command == "spicetify restore backup apply" {
        return execute_repair_command(app_handle).await;
    } else if command == "spicetify backup" {
        return execute_backup_command(app_handle).await;
    }

    let output = execute_with_progress(command, app_handle).await?;
    Ok(output)
}

async fn execute_with_progress(command: String, app_handle: AppHandle) -> Result<String, String> {
    let app_handle_clone = app_handle.clone();

    app_handle.emit("progress_update", 0).unwrap();

    // Create a PowerShell script file for better command execution
    let temp_dir = env::temp_dir();
    let script_path = temp_dir.join("spicetify_command.ps1");

    let script_content = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
    {}
    Write-Output "Command executed successfully."
}} catch {{
    Write-Output "Error: $_"
    exit 1
}}
"#,
        command
    );

    fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write command script: {}", e))?;

    let progress_handle = tokio::spawn(async move {
        let total_steps = 10;
        for step in 1..=total_steps {
            let progress = (step as f32 / total_steps as f32) * 100.0;
            app_handle_clone
                .emit("progress_update", progress as u32)
                .unwrap();
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    });

    let output = Command::new("powershell")
        .args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let _ = fs::remove_file(script_path);
    let _ = progress_handle.await;

    app_handle.emit("progress_update", 100).unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Command output: {}", stdout);
    if !stderr.is_empty() {
        println!("Command error: {}", stderr);
    }

    if output.status.success() {
        Ok(format!("{}\n{}", stdout, stderr))
    } else {
        Err(format!(
            "Command failed with status code {}: {}",
            output.status, stderr
        ))
    }
}

// Specialized function for uninstall command
async fn execute_uninstall_command(app_handle: AppHandle) -> Result<String, String> {
    app_handle.emit("progress_update", 10).unwrap();

    // Create a PowerShell script for uninstallation
    let temp_dir = env::temp_dir();
    let script_path = temp_dir.join("spicetify_uninstall.ps1");

    let script_content = r#"
$ErrorActionPreference = 'Continue'
Write-Output "Step 1: Restoring Spotify to original state..."
try {
    spicetify restore
    Write-Output "Spotify has been restored to its original state."
} catch {
    Write-Output "Warning: $($_.Exception.Message)"
}

Write-Output "`nStep 2: Removing Spicetify from AppData folder..."
if (Test-Path "$env:APPDATA\spicetify") {
    Remove-Item -Path "$env:APPDATA\spicetify" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "Removed Spicetify from AppData folder."
} else {
    Write-Output "AppData\spicetify folder not found."
}

Write-Output "`nStep 3: Removing Spicetify from LocalAppData folder..."
if (Test-Path "$env:LOCALAPPDATA\spicetify") {
    Remove-Item -Path "$env:LOCALAPPDATA\spicetify" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output "Removed Spicetify from LocalAppData folder."
} else {
    Write-Output "LocalAppData\spicetify folder not found."
}

Write-Output "`nSpicetify has been completely uninstalled from your system."
"#;

    fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write uninstall script: {}", e))?;

    let app_handle_clone = app_handle.clone();
    let progress_handle = tokio::spawn(async move {
        let progress_steps = vec![20, 40, 60, 80, 90];
        for progress in progress_steps {
            tokio::time::sleep(Duration::from_millis(500)).await;
            app_handle_clone.emit("progress_update", progress).unwrap();
        }
    });

    let output = Command::new("powershell")
        .args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute uninstall script: {}", e))?;

    let _ = fs::remove_file(script_path);
    let _ = progress_handle.await;

    app_handle.emit("progress_update", 100).unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Uninstall output: {}", stdout);
    if !stderr.is_empty() {
        println!("Uninstall error: {}", stderr);
    }

    Ok(stdout)
}

// Specialized function for repair command
async fn execute_repair_command(app_handle: AppHandle) -> Result<String, String> {
    app_handle.emit("progress_update", 10).unwrap();

    // Create a PowerShell script for repair
    let temp_dir = env::temp_dir();
    let script_path = temp_dir.join("spicetify_repair.ps1");

    let script_content = r#"
$ErrorActionPreference = 'Stop'
Write-Output "Step 1: Restoring Spotify to original state..."
try {
    spicetify restore
    Write-Output "Spotify has been restored to its original state."
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    exit 1
}

Write-Output "`nStep 2: Creating a new backup..."
try {
    spicetify backup
    Write-Output "Backup created successfully."
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    exit 1
}

Write-Output "`nStep 3: Applying Spicetify customizations..."
try {
    spicetify apply
    Write-Output "Spicetify applied successfully."
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    exit 1
}

Write-Output "`nRepair process completed successfully!"
"#;

    fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write repair script: {}", e))?;

    let app_handle_clone = app_handle.clone();
    let progress_handle = tokio::spawn(async move {
        let progress_steps = vec![20, 30, 50, 70, 90];
        for progress in progress_steps {
            tokio::time::sleep(Duration::from_millis(500)).await;
            app_handle_clone.emit("progress_update", progress).unwrap();
        }
    });

    let output = Command::new("powershell")
        .args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute repair script: {}", e))?;

    let _ = fs::remove_file(script_path);
    let _ = progress_handle.await;

    app_handle.emit("progress_update", 100).unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Repair output: {}", stdout);
    if !stderr.is_empty() {
        println!("Repair error: {}", stderr);
    }

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("Repair failed: {}", stderr))
    }
}

// Specialized function for backup command
async fn execute_backup_command(app_handle: AppHandle) -> Result<String, String> {
    app_handle.emit("progress_update", 10).unwrap();

    // Create a PowerShell script for backup
    let temp_dir = env::temp_dir();
    let script_path = temp_dir.join("spicetify_backup.ps1");

    let script_content = r#"
$ErrorActionPreference = 'Stop'
Write-Output "Creating backup of Spotify installation..."
try {
    spicetify backup
    Write-Output "Backup created successfully."
} catch {
    Write-Output "Error: $($_.Exception.Message)"
    exit 1
}

Write-Output "`nBackup process completed successfully!"
"#;

    fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write backup script: {}", e))?;

    let app_handle_clone = app_handle.clone();
    let progress_handle = tokio::spawn(async move {
        let progress_steps = vec![30, 50, 70, 90];
        for progress in progress_steps {
            tokio::time::sleep(Duration::from_millis(400)).await;
            app_handle_clone.emit("progress_update", progress).unwrap();
        }
    });

    let output = Command::new("powershell")
        .args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute backup script: {}", e))?;

    let _ = fs::remove_file(script_path);
    let _ = progress_handle.await;

    app_handle.emit("progress_update", 100).unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Backup output: {}", stdout);
    if !stderr.is_empty() {
        println!("Backup error: {}", stderr);
    }

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("Backup failed: {}", stderr))
    }
}

// Replace the install_spicetify_direct function with this improved version
async fn install_spicetify_direct(app_handle: AppHandle) -> Result<String, String> {
    let temp_dir = env::temp_dir();
    let install_script_path = temp_dir.join("spicetify_direct_install.ps1");

    // Create an improved installation script with better PATH handling and verification
    let install_script = r#"
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "Starting Spicetify installation process..." -ForegroundColor Cyan

#region Variables
$spicetifyFolderPath = "$env:LOCALAPPDATA\spicetify"
$spicetifyOldFolderPath = "$HOME\spicetify-cli"
#endregion Variables

#region Functions
function Write-Success {
  param ($message = "OK")
  Write-Host " > $message" -ForegroundColor Green
}

function Write-Unsuccess {
  param ($message = "ERROR")
  Write-Host " > $message" -ForegroundColor Red
}

function Test-Admin {
  Write-Host "Checking if the script is not being run as administrator..." -NoNewline
  $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  -not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Add-SpicetifyToPath {
  Write-Host "Making Spicetify available in the PATH (current session and permanently)..." -NoNewline
  $user = [EnvironmentVariableTarget]::User
  $path = [Environment]::GetEnvironmentVariable('PATH', $user)
  
  # First remove any old paths
  $path = $path -replace "$([regex]::Escape($spicetifyOldFolderPath))\\*;*", ''
  
  # Then add the new path if it's not already there
  if ($path -notlike "*$spicetifyFolderPath*") {
    $path = "$path;$spicetifyFolderPath"
    
    # Update the path for future sessions
    [Environment]::SetEnvironmentVariable('PATH', $path, $user)
    
    # Also update the path for the current session
    $env:PATH = $path
    
    Write-Success "Path updated successfully"
  } else {
    Write-Success "Path already contains Spicetify"
  }
  
  # Verify the path update
  Write-Host "Verifying PATH update..." -NoNewline
  $updatedPath = [Environment]::GetEnvironmentVariable('PATH', $user)
  if ($updatedPath -like "*$spicetifyFolderPath*") {
    Write-Success "PATH verified"
  } else {
    Write-Unsuccess "PATH verification failed"
    Write-Host "Current PATH: $updatedPath" -ForegroundColor Yellow
    Write-Host "Expected to contain: $spicetifyFolderPath" -ForegroundColor Yellow
  }
}

function Get-Spicetify {
  if ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64') {
    $architecture = 'x64'
  }
  elseif ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    $architecture = 'arm64'
  }
  else {
    $architecture = 'x32'
  }
  
  Write-Host 'Fetching the latest Spicetify version...' -NoNewline
  try {
    $latestRelease = Invoke-RestMethod -Uri 'https://api.github.com/repos/spicetify/cli/releases/latest'
    $targetVersion = $latestRelease.tag_name -replace 'v', ''
    Write-Success "Found version $targetVersion"
  }
  catch {
    Write-Unsuccess
    Write-Host "Failed to fetch latest version: $_" -ForegroundColor Red
    $targetVersion = "2.16.2" # Fallback to a known good version
    Write-Host "Using fallback version $targetVersion" -ForegroundColor Yellow
  }
  
  $archivePath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "spicetify.zip")
  
  Write-Host "Downloading Spicetify v$targetVersion for $architecture..." -NoNewline
  try {
    $Parameters = @{
      Uri            = "https://github.com/spicetify/cli/releases/download/v$targetVersion/spicetify-$targetVersion-windows-$architecture.zip"
      UseBasicParsing = $true
      OutFile        = $archivePath
    }
    Invoke-WebRequest @Parameters
    Write-Success
    return $archivePath
  }
  catch {
    Write-Unsuccess
    Write-Host "Download failed: $_" -ForegroundColor Red
    throw
  }
}

function Install-Spicetify {
  Write-Host "Installing Spicetify..." -ForegroundColor Cyan
  
  # Create the directory if it doesn't exist
  if (!(Test-Path -Path $spicetifyFolderPath)) {
    Write-Host "Creating Spicetify directory..." -NoNewline
    New-Item -Path $spicetifyFolderPath -ItemType Directory -Force | Out-Null
    Write-Success
  }
  
  try {
    $archivePath = Get-Spicetify
    
    Write-Host 'Extracting Spicetify...' -NoNewline
    Expand-Archive -Path $archivePath -DestinationPath $spicetifyFolderPath -Force
    Write-Success
    
    # Add to PATH
    Add-SpicetifyToPath
    
    # Clean up
    Remove-Item -Path $archivePath -Force -ErrorAction 'SilentlyContinue'
    
    # Verify installation
    Write-Host "Verifying Spicetify installation..." -NoNewline
    if (Test-Path -Path "$spicetifyFolderPath\spicetify.exe") {
      Write-Success "spicetify.exe found"
    } else {
      Write-Unsuccess "spicetify.exe not found"
      Write-Host "Contents of ${spicetifyFolderPath}:" -ForegroundColor Yellow
      Get-ChildItem -Path $spicetifyFolderPath | ForEach-Object { Write-Host " - $($_.Name)" }
      throw "Spicetify executable not found after installation"
    }
    
    Write-Host "Spicetify was successfully installed!" -ForegroundColor Green
    
    # Return the installation path for diagnostics
    return $spicetifyFolderPath
  }
  catch {
    Write-Host "Installation failed: $_" -ForegroundColor Red
    throw
  }
}

function Install-SpicetifyMarketplace {
  Write-Host "Installing Spicetify Marketplace..." -ForegroundColor Cyan
  try {
    $Parameters = @{
      Uri             = 'https://raw.githubusercontent.com/spicetify/spicetify-marketplace/main/resources/install.ps1'
      UseBasicParsing = $true
    }
    $marketplaceScript = (Invoke-WebRequest @Parameters).Content
    
    # Execute the marketplace script
    $tempScriptPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "marketplace-install.ps1")
    Set-Content -Path $tempScriptPath -Value $marketplaceScript
    
    # Run the script
    & $tempScriptPath
    
    # Clean up
    Remove-Item -Path $tempScriptPath -Force -ErrorAction SilentlyContinue
    
    Write-Host "Marketplace installation completed" -ForegroundColor Green
  }
  catch {
    Write-Host "Marketplace installation failed: $_" -ForegroundColor Red
    Write-Host "You can install the marketplace manually later." -ForegroundColor Yellow
  }
}

function Test-SpicetifyCommand {
  Write-Host "Testing Spicetify command..." -NoNewline
  try {
    $testResult = & "$spicetifyFolderPath\spicetify.exe" -v
    Write-Success "Version: $testResult"
    
    # Try refreshing the PATH and testing again if direct execution worked
    if ($testResult) {
      Write-Host "Refreshing PowerShell PATH and testing system-wide command..." -NoNewline
      try {
        # Update PATH for the current session
        $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        $globalTest = spicetify -v
        Write-Success "Global command test successful: $globalTest"
      }
      catch {
        Write-Unsuccess
        Write-Host "Global command test failed. You may need to restart your terminal." -ForegroundColor Yellow
      }
    }
    
    return $true
  }
  catch {
    Write-Unsuccess
    Write-Host "Failed to run Spicetify: $_" -ForegroundColor Red
    return $false
  }
}
#endregion Functions

#region Main
try {
  # Check prerequisites
  if (-not (Test-Admin)) {
    Write-Warning "The script is being run as administrator. This can result in problems with the installation process."
    Write-Success "Proceeding anyway"
  } else {
    Write-Success "Not running as administrator"
  }
  
  # Process old Spicetify folder if it exists
  if (Test-Path -Path $spicetifyOldFolderPath) {
    Write-Host "Moving old Spicetify folder..." -NoNewline
    if (!(Test-Path -Path $spicetifyFolderPath)) {
      New-Item -Path $spicetifyFolderPath -ItemType Directory -Force | Out-Null
    }
    Copy-Item -Path "$spicetifyOldFolderPath\*" -Destination $spicetifyFolderPath -Recurse -Force
    Remove-Item -Path $spicetifyOldFolderPath -Recurse -Force
    Write-Success
  }
  
  # Install Spicetify
  $installPath = Install-Spicetify
  
  # Test the Spicetify command
  $commandWorks = Test-SpicetifyCommand
  
  # Install Marketplace
  if ($commandWorks) {
    Install-SpicetifyMarketplace
  }
  
  # Summary
  Write-Host ""
  Write-Host "== Installation Summary ==" -ForegroundColor Cyan
  Write-Host "Installation directory: $installPath"
  if ($commandWorks) {
    Write-Host "Command test: Successful" -ForegroundColor Green
  } else {
    Write-Host "Command test: Failed" -ForegroundColor Red
    Write-Host "Try running: $installPath\spicetify.exe" -ForegroundColor Yellow
  }
  
  Write-Host ""
  Write-Host "To get started, run:" -NoNewline
  Write-Host " spicetify -h " -NoNewline -ForegroundColor Cyan
  Write-Host "or open a new terminal window if the command is not recognized."
  
  # Diagnostic info
  Write-Host ""
  Write-Host "== Diagnostic Information ==" -ForegroundColor Cyan
  Write-Host "PATH variable contains Spicetify directory: $([Environment]::GetEnvironmentVariable('PATH', 'User') -like '*spicetify*')"
  Write-Host "Spicetify executable exists: $(Test-Path -Path "$spicetifyFolderPath\spicetify.exe")"
  
  Write-Host ""
  Write-Host "Installation completed successfully!" -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "== Installation Failed ==" -ForegroundColor Red
  Write-Host "Error: $_" -ForegroundColor Red
  Write-Host ""
  Write-Host "== Diagnostics ==" -ForegroundColor Yellow
  Write-Host "Spicetify directory exists: $(Test-Path -Path $spicetifyFolderPath)"
  Write-Host "Current user: $([Environment]::UserName)"
  Write-Host "Check if you have permissions to write to $env:LOCALAPPDATA"
  
  throw "Installation failed: $_"
}
#endregion Main
    "#;

    fs::write(&install_script_path, install_script)
        .map_err(|e| format!("Failed to write installation script: {}", e))?;

    app_handle.emit("progress_update", 0).unwrap();

    let app_handle_clone = app_handle.clone();
    let progress_handle = tokio::spawn(async move {
        let progress_steps = vec![10, 15, 20, 30, 50, 70, 80, 90, 95];

        for progress in progress_steps {
            tokio::time::sleep(Duration::from_millis(800)).await;
            app_handle_clone.emit("progress_update", progress).unwrap();
        }
    });

    let output = Command::new("powershell")
        .args(&[
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &install_script_path.to_string_lossy(),
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute installation script: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let _ = fs::remove_file(install_script_path);
    let _ = progress_handle.await;

    app_handle.emit("progress_update", 100).unwrap();

    if output.status.success() {
        Ok(format!(
            "Spicetify installation completed successfully.\n{}\n{}",
            stdout, stderr
        ))
    } else {
        Err(format!(
            "Spicetify installation failed: {}\n{}",
            stderr, stdout
        ))
    }
}

// Update the check_versions function to add the Cargo.toml dependency
#[tauri::command]
pub async fn check_versions() -> Result<VersionInfo, String> {
    if CHECKING_UPDATES
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Already checking for updates".to_string());
    }

    // Get the current installer version from Cargo.toml
    let installer_version = env!("CARGO_PKG_VERSION").to_string();
    let mut diagnostic_info = String::new();

    // First check if the Spicetify directory exists
    println!("Checking if Spicetify directory exists...");
    diagnostic_info.push_str("Checking Spicetify directories:\n");

    let localappdata_path = match env::var("LOCALAPPDATA") {
        Ok(path) => path,
        Err(_) => {
            diagnostic_info.push_str("- Failed to get LOCALAPPDATA environment variable\n");
            String::new()
        }
    };

    let spicetify_path = format!("{}\\spicetify", localappdata_path);
    let spicetify_exe_path = format!("{}\\spicetify.exe", spicetify_path);

    let dir_exists = std::path::Path::new(&spicetify_path).exists();
    let exe_exists = std::path::Path::new(&spicetify_exe_path).exists();

    diagnostic_info.push_str(&format!(
        "- Spicetify directory exists at {}: {}\n",
        spicetify_path, dir_exists
    ));
    diagnostic_info.push_str(&format!(
        "- Spicetify executable exists at {}: {}\n",
        spicetify_exe_path, exe_exists
    ));

    // Try direct execution first if the executable exists
    let mut spicetify_version = None;

    if exe_exists {
        println!("Trying direct Spicetify executable check...");
        diagnostic_info.push_str("\nTrying direct executable check:\n");

        let direct_output = Command::new(&spicetify_exe_path)
            .creation_flags(0x08000000)
            .args(&["-v"])
            .output();

        match direct_output {
            Ok(output) => {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostic_info
                        .push_str(&format!("- Direct executable check result: {}\n", version));
                    if !version.is_empty() {
                        spicetify_version = Some(version);
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    diagnostic_info.push_str(&format!(
                        "- Direct executable check failed with status: {}\n",
                        output.status
                    ));
                    if !stderr.is_empty() {
                        diagnostic_info.push_str(&format!("- Error: {}\n", stderr));
                    }
                }
            }
            Err(e) => {
                diagnostic_info.push_str(&format!("- Direct executable check error: {}\n", e));
            }
        }
    }

    // Try CMD next if we still don't have a version
    if spicetify_version.is_none() {
        println!("Checking Spicetify version using CMD...");
        diagnostic_info.push_str("\nTrying CMD check:\n");

        let cmd_output = Command::new("cmd")
            .creation_flags(0x08000000)
            .args(&["/c", "spicetify -v"])
            .output();

        match cmd_output {
            Ok(output) => {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostic_info.push_str(&format!("- CMD check result: {}\n", version));
                    if !version.is_empty() {
                        spicetify_version = Some(version);
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    diagnostic_info.push_str(&format!(
                        "- CMD check failed with status: {}\n",
                        output.status
                    ));
                    if !stderr.is_empty() {
                        diagnostic_info.push_str(&format!("- Error: {}\n", stderr));
                    }
                }
            }
            Err(e) => {
                diagnostic_info.push_str(&format!("- CMD check error: {}\n", e));
            }
        }
    }

    // Try PowerShell as a last resort
    if spicetify_version.is_none() {
        println!("Trying fallback PowerShell approach...");
        diagnostic_info.push_str("\nTrying PowerShell check:\n");

        let ps_output = Command::new("powershell")
            .creation_flags(0x08000000)
            .args(&[
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "spicetify -v",
            ])
            .output();

        match ps_output {
            Ok(output) => {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    diagnostic_info.push_str(&format!("- PowerShell check result: {}\n", version));
                    if !version.is_empty() {
                        spicetify_version = Some(version);
                    }
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                    diagnostic_info.push_str(&format!(
                        "- PowerShell check failed with status: {}\n",
                        output.status
                    ));
                    if !stderr.is_empty() {
                        diagnostic_info.push_str(&format!("- Error: {}\n", stderr));
                    }
                }
            }
            Err(e) => {
                diagnostic_info.push_str(&format!("- PowerShell check error: {}\n", e));
            }
        }
    }

    // Check if we need an update (if version was found)
    let has_spicetify_update = if let Some(current_version) = &spicetify_version {
        !current_version.starts_with("2.")
    } else {
        false
    };

    // Check for installer updates
    let (latest_version, download_url) = match check_github_release().await {
        Ok((v, url)) => (Some(v), Some(url)),
        Err(e) => {
            println!("Error checking GitHub: {}", e);
            diagnostic_info.push_str(&format!("\nGitHub check error: {}\n", e));
            (None, None)
        }
    };

    // Replace with this improved version comparison that handles alpha/beta versions:
    let has_installer_update = if let Some(latest) = &latest_version {
        println!(
            "Comparing versions: current={}, latest={}",
            installer_version, latest
        );

        // First, try to compare versions directly as strings
        if latest != &installer_version {
            // Extract numeric parts for comparison
            let current_parts: Vec<&str> =
                installer_version.split(|c: char| !c.is_digit(10)).collect();
            let latest_parts: Vec<&str> = latest.split(|c: char| !c.is_digit(10)).collect();

            let mut is_newer = false;

            // Compare each numeric part
            for i in 0..std::cmp::min(current_parts.len(), latest_parts.len()) {
                if !current_parts[i].is_empty() && !latest_parts[i].is_empty() {
                    let current_num = current_parts[i].parse::<i32>().unwrap_or(0);
                    let latest_num = latest_parts[i].parse::<i32>().unwrap_or(0);

                    if latest_num != current_num {
                        is_newer = latest_num > current_num;
                        break;
                    }
                }
            }

            // If all numeric parts are equal, the longer version is considered newer
            // (e.g., "1.0.2" is newer than "1.0")
            if !is_newer && latest_parts.len() != current_parts.len() {
                is_newer = latest_parts.len() > current_parts.len();
            }

            // If we get here and still not determined, compare the full strings
            // This handles cases like "1.0.1-Alpha" vs "1.0.2-Alpha"
            if !is_newer {
                is_newer = latest > &installer_version;
            }

            is_newer
        } else {
            false
        }
    } else {
        false
    };

    println!(
        "Final version info: installer={}, spicetify={:?}, has_update={}",
        installer_version, spicetify_version, has_spicetify_update
    );

    diagnostic_info.push_str(&format!("\nFinal version info: installer={}, spicetify={:?}, has_update={}, diagnostic_complete=true",
        installer_version, spicetify_version, has_spicetify_update));

    println!("Diagnostic info:\n{}", diagnostic_info);

    CHECKING_UPDATES.store(false, Ordering::SeqCst);

    Ok(VersionInfo {
        installer_version,
        spicetify_version,
        has_installer_update,
        has_spicetify_update,
        latest_installer_version: latest_version,
        latest_installer_url: download_url,
    })
}

#[tauri::command]
pub async fn download_update(_app_handle: AppHandle) -> Result<(), String> {
    let version_info = check_versions().await?;

    if !version_info.has_installer_update {
        return Err("No updates available".to_string());
    }

    let download_url = version_info
        .latest_installer_url
        .ok_or("No download URL available")?;

    let temp_dir = env::temp_dir();
    let filename = download_url
        .split('/')
        .last()
        .unwrap_or("spicetify-installer-update.exe");
    let _download_path = temp_dir.join(filename);

    open_download_url().await?;

    Ok(())
}

#[tauri::command]
pub async fn open_faq_url() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/c", "start", "https://spicetify.app/docs/faq/"])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("https://spicetify.app/docs/faq/")
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg("https://spicetify.app/docs/faq/")
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_download_url() -> Result<(), String> {
    let download_url = "https://github.com/FIREPAWER07/spicetify-installer/releases/latest";

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/c", "start", download_url])
            .spawn()
            .map_err(|e| format!("Failed to open download URL: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(download_url)
            .spawn()
            .map_err(|e| format!("Failed to open download URL: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(download_url)
            .spawn()
            .map_err(|e| format!("Failed to open download URL: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn check_spicetify_location() -> Result<String, String> {
    let locations = vec![
        "%LOCALAPPDATA%\\spicetify",
        "%USERPROFILE%\\spicetify-cli",
        "%APPDATA%\\spicetify",
    ];

    let mut result = String::new();
    result.push_str("Checking for Spicetify in common locations:\n");

    for location in locations {
        let expanded_location = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .creation_flags(0x08000000)
                .args(&["/c", &format!("echo {}", location)])
                .output()
                .ok()
                .and_then(|output| {
                    if output.status.success() {
                        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
                    } else {
                        None
                    }
                })
                .unwrap_or_else(|| location.to_string())
        } else {
            location.to_string()
        };

        result.push_str(&format!("Checking: {}\n", expanded_location));

        let exists = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .creation_flags(0x08000000)
                .args(&["/c", &format!("if exist \"{}\" echo 1", expanded_location)])
                .output()
                .ok()
                .and_then(|output| {
                    if output.status.success() && !output.stdout.is_empty() {
                        Some(true)
                    } else {
                        Some(false)
                    }
                })
                .unwrap_or(false)
        } else {
            std::path::Path::new(&expanded_location).exists()
        };

        if exists {
            result.push_str(&format!("FOUND: {}\n", expanded_location));
        } else {
            result.push_str(&format!("Not found: {}\n", expanded_location));
        }
    }

    result.push_str("\nChecking PATH for spicetify:\n");
    let path_check = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .creation_flags(0x08000000)
            .args(&["/c", "where spicetify 2>NUL"])
            .output()
    } else {
        Command::new("sh")
            .args(&["-c", "which spicetify 2>/dev/null"])
            .output()
    };

    match path_check {
        Ok(output) => {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                result.push_str(&format!("Spicetify found in PATH: {}\n", path));
            } else {
                result.push_str("Spicetify NOT found in PATH\n");
            }
        }
        Err(e) => {
            result.push_str(&format!("Error checking PATH: {}\n", e));
        }
    }

    Ok(result)
}
