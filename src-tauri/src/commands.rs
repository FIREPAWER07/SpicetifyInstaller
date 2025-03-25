#[cfg(windows)]
use std::os::windows::process::CommandExt;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// Make sure the struct field names match exactly what the TypeScript interface expects
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
}

// Global state to track if we're currently checking for updates
static CHECKING_UPDATES: Mutex<bool> = Mutex::new(false);

#[tauri::command]
pub async fn execute_powershell_command(command: String, app_handle: AppHandle) -> Result<String, String> {
    println!("Executing PowerShell command: {}", command);

    // Special handling for Spicetify installation
    if command.contains("spicetify-cli/master/install.ps1") {
        return install_spicetify_direct(app_handle).await;
    }
    
    // For other commands, use standard execution with progress tracking
    let output = execute_with_progress(command, app_handle).await?;
    
    Ok(output)
}

async fn execute_with_progress(command: String, app_handle: AppHandle) -> Result<String, String> {
    // Create a thread to emit progress updates
    let app_handle_clone = app_handle.clone();
    
    // Start with 0% progress
    app_handle.emit("progress_update", 0).unwrap();
    
    // Execute the command
    let output = Command::new("powershell")
    .args(&[
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &command,
    ])
    .creation_flags(0x08000000) // CREATE_NO_WINDOW flag
    .output()
    .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Command output: {}", stdout);
    if !stderr.is_empty() {
        println!("Command error: {}", stderr);
    }

    // Simulate progress updates based on command output
    let progress_thread = thread::spawn(move || {
        let total_steps = 10;
        for step in 1..=total_steps {
            // Calculate progress percentage
            let progress = (step as f32 / total_steps as f32) * 100.0;
            
            // Emit progress update event
            app_handle_clone.emit("progress_update", progress as u32).unwrap();
            
            // Sleep to simulate work being done
            thread::sleep(Duration::from_millis(300));
        }
    });

    // Wait for progress thread to complete
    let _ = progress_thread.join();
    
    // Set final progress to 100%
    app_handle.emit("progress_update", 100).unwrap();

    if output.status.success() {
        Ok(format!("{}\n{}", stdout, stderr))
    } else {
        Err(format!(
            "Command failed with status code {}: {}",
            output.status, stderr
        ))
    }
}

async fn install_spicetify_direct(app_handle: AppHandle) -> Result<String, String> {
    // Create a custom PowerShell script that directly installs Spicetify without prompts
    let temp_dir = env::temp_dir();
    let install_script_path = temp_dir.join("spicetify_direct_install.ps1");

    // This script will:
    // 1. Determine the installation directory
    // 2. Create the directory if it doesn't exist
    // 3. Download the latest release from GitHub
    // 4. Extract it to the installation directory
    // 5. Add the directory to PATH if it's not already there
    let install_script = r#"
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

#region Variables
$spicetifyFolderPath = "$env:LOCALAPPDATA\spicetify"
$spicetifyOldFolderPath = "$HOME\spicetify-cli"
#endregion Variables

#region Functions
function Write-Success {
  [CmdletBinding()]
  param ()
  process {
    Write-Host -Object ' > OK' -ForegroundColor 'Green'
  }
}

function Write-Unsuccess {
  [CmdletBinding()]
  param ()
  process {
    Write-Host -Object ' > ERROR' -ForegroundColor 'Red'
  }
}

function Test-Admin {
  [CmdletBinding()]
  param ()
  begin {
    Write-Host -Object "Checking if the script is not being run as administrator..." -NoNewline
  }
  process {
    $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    -not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  }
}

function Test-PowerShellVersion {
  [CmdletBinding()]
  param ()
  begin {
    $PSMinVersion = [version]'5.1'
  }
  process {
    Write-Host -Object 'Checking if your PowerShell version is compatible...' -NoNewline
    $PSVersionTable.PSVersion -ge $PSMinVersion
  }
}

function Move-OldSpicetifyFolder {
  [CmdletBinding()]
  param ()
  process {
    if (Test-Path -Path $spicetifyOldFolderPath) {
      Write-Host -Object 'Moving the old spicetify folder...' -NoNewline
      Copy-Item -Path "$spicetifyOldFolderPath\*" -Destination $spicetifyFolderPath -Recurse -Force
      Remove-Item -Path $spicetifyOldFolderPath -Recurse -Force
      Write-Success
    }
  }
}

function Get-Spicetify {
  [CmdletBinding()]
  param ()
  begin {
    if ($env:PROCESSOR_ARCHITECTURE -eq 'AMD64') {
      $architecture = 'x64'
    }
    elseif ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
      $architecture = 'arm64'
    }
    else {
      $architecture = 'x32'
    }
    if ($v) {
      if ($v -match '^\d+\.\d+\.\d+$') {
        $targetVersion = $v
      }
      else {
        Write-Warning -Message "You have spicefied an invalid spicetify version: $v `nThe version must be in the following format: 1.2.3"
        exit
      }
    }
    else {
      Write-Host -Object 'Fetching the latest spicetify version...' -NoNewline
      $latestRelease = Invoke-RestMethod -Uri 'https://api.github.com/repos/spicetify/cli/releases/latest'
      $targetVersion = $latestRelease.tag_name -replace 'v', ''
      Write-Success
    }
    $archivePath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "spicetify.zip")
  }
  process {
    Write-Host -Object "Downloading spicetify v$targetVersion..." -NoNewline
    $Parameters = @{
      Uri            = "https://github.com/spicetify/cli/releases/download/v$targetVersion/spicetify-$targetVersion-windows-$architecture.zip"
      UseBasicParsin = $true
      OutFile        = $archivePath
    }
    Invoke-WebRequest @Parameters
    Write-Success
  }
  end {
    $archivePath
  }
}

function Add-SpicetifyToPath {
  [CmdletBinding()]
  param ()
  begin {
    Write-Host -Object 'Making spicetify available in the PATH...' -NoNewline
    $user = [EnvironmentVariableTarget]::User
    $path = [Environment]::GetEnvironmentVariable('PATH', $user)
  }
  process {
    $path = $path -replace "$([regex]::Escape($spicetifyOldFolderPath))\\*;*", ''
    if ($path -notlike "*$spicetifyFolderPath*") {
      $path = "$path;$spicetifyFolderPath"
    }
  }
  end {
    [Environment]::SetEnvironmentVariable('PATH', $path, $user)
    $env:PATH = $path
    Write-Success
  }
}

function Install-Spicetify {
  [CmdletBinding()]
  param ()
  begin {
    Write-Host -Object 'Installing spicetify...'
  }
  process {
    $archivePath = Get-Spicetify
    Write-Host -Object 'Extracting spicetify...' -NoNewline
    Expand-Archive -Path $archivePath -DestinationPath $spicetifyFolderPath -Force
    Write-Success
    Add-SpicetifyToPath
  }
  end {
    Remove-Item -Path $archivePath -Force -ErrorAction 'SilentlyContinue'
    Write-Host -Object 'spicetify was successfully installed!' -ForegroundColor 'Green'
  }
}
#endregion Functions

#region Main
#region Checks
if (-not (Test-PowerShellVersion)) {
  Write-Unsuccess
  Write-Warning -Message 'PowerShell 5.1 or higher is required to run this script'
  Write-Warning -Message "You are running PowerShell $($PSVersionTable.PSVersion)"
  Write-Host -Object 'PowerShell 5.1 install guide:'
  Write-Host -Object 'https://learn.microsoft.com/skypeforbusiness/set-up-your-computer-for-windows-powershell/download-and-install-windows-powershell-5-1'
  Write-Host -Object 'PowerShell 7 install guide:'
  Write-Host -Object 'https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows'
  exit
}
else {
  Write-Success
}
if (-not (Test-Admin)) {
  Write-Unsuccess
  Write-Warning -Message "The script was run as administrator. This can result in problems with the installation process or unexpected behavior. Proceeding with installation..."
}
else {
  Write-Success
}
#endregion Checks

#region Spicetify
Move-OldSpicetifyFolder
Install-Spicetify
Write-Host -Object "`nRun" -NoNewline
Write-Host -Object ' spicetify -h ' -NoNewline -ForegroundColor 'Cyan'
Write-Host -Object 'to get started'
#endregion Spicetify

#region Marketplace
Write-Host -Object 'Installing Spicetify Marketplace...'
$Parameters = @{
  Uri             = 'https://raw.githubusercontent.com/spicetify/spicetify-marketplace/main/resources/install.ps1'
  UseBasicParsing = $true
}
Invoke-WebRequest @Parameters | Invoke-Expression
#endregion Marketplace
#endregion Main
    "#;

    fs::write(&install_script_path, install_script)
        .map_err(|e| format!("Failed to write installation script: {}", e))?;

    // Start with 0% progress
    app_handle.emit("progress_update", 0).unwrap();

    // Create a thread to emit progress updates during installation
    let app_handle_clone = app_handle.clone();
    let progress_thread = thread::spawn(move || {
        // Installation typically has these phases:
        // 1. Checking PowerShell version (10%)
        // 2. Checking admin status (15%)
        // 3. Moving old folder if exists (20%)
        // 4. Fetching latest version (30%)
        // 5. Downloading (50%)
        // 6. Extracting (70%)
        // 7. Adding to PATH (80%)
        // 8. Installing marketplace (90%)
        // 9. Cleanup (95%)
        // 10. Complete (100%)
        
        let progress_steps = vec![10, 15, 20, 30, 50, 70, 80, 90, 95];
        
        for progress in progress_steps {
            // Sleep to simulate the time each step takes
            thread::sleep(Duration::from_millis(800));
            
            // Emit progress update
            app_handle_clone.emit("progress_update", progress).unwrap();
        }
    });

    // Execute the installation script
    let output = Command::new("powershell")
    .args(&[
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &install_script_path.to_string_lossy(),
    ])
    .creation_flags(0x08000000) // CREATE_NO_WINDOW flag
    .output()
    .map_err(|e| format!("Failed to execute installation script: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Clean up
    let _ = fs::remove_file(install_script_path);

    // Wait for progress thread to complete
    let _ = progress_thread.join();
    
    // Set final progress to 100%
    app_handle.emit("progress_update", 100).unwrap();

    if output.status.success() {
        Ok(format!(
            "Spicetify installation completed successfully.\n{}\n{}",
            stdout, stderr
        ))
    } else {
        Err(format!("Spicetify installation failed: {}", stderr))
    }
}

#[tauri::command]
pub async fn check_versions() -> Result<VersionInfo, String> {
    // Set checking updates flag
    let mut checking = CHECKING_UPDATES.lock().unwrap();
    if *checking {
        return Err("Already checking for updates".to_string());
    }
    *checking = true;
    
    // Hardcode a version number for testing instead of relying on CARGO_PKG_VERSION
    // In a real app, you would use a more reliable method to get the version
    let installer_version = "1.0.0".to_string();

    // DIRECT APPROACH: Use cmd to check for spicetify version
    // This is the most reliable method on Windows
    println!("Checking Spicetify version using direct cmd approach...");
    let cmd_output = Command::new("cmd")
    .creation_flags(0x08000000) // Add this line
    .args(&["/c", "spicetify -v"])
    .output();

    let spicetify_version = match cmd_output {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                println!("CMD direct check found Spicetify version: {}", version);
                if !version.is_empty() {
                    Some(version)
                } else {
                    println!("CMD returned empty version string");
                    None
                }
            } else {
                println!("CMD spicetify check failed with status: {}", output.status);
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stderr.is_empty() {
                    println!("Error output: {}", stderr);
                }
                None
            }
        }
        Err(e) => {
            println!("Failed to execute CMD spicetify check: {}", e);
            None
        }
    };

    // If the direct approach failed, try a fallback using PowerShell
    let spicetify_version = if spicetify_version.is_none() {
        println!("Trying fallback PowerShell approach...");
        let ps_output = Command::new("powershell")
        .creation_flags(0x08000000) // Add this line
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
                    println!("PowerShell fallback found Spicetify version: {}", version);
                    if !version.is_empty() {
                        Some(version)
                    } else {
                        println!("PowerShell returned empty version string");
                        None
                    }
                } else {
                    println!(
                        "PowerShell spicetify check failed with status: {}",
                        output.status
                    );
                    None
                }
            }
            Err(e) => {
                println!("Failed to execute PowerShell spicetify check: {}", e);
                None
            }
        }
    } else {
        spicetify_version
    };

    // Check for latest version from GitHub
    let has_spicetify_update = if let Some(current_version) = &spicetify_version {
        // In a real app, you would fetch the latest version from GitHub
        // and compare it with the current version
        // For now, we'll just check if the version is not the latest (2.x.x)
        !current_version.starts_with("2.")
    } else {
        false
    };

    // For app updates, you would check against your release server
    let has_installer_update = false;

    println!(
        "Final version info: installer={}, spicetify={:?}, has_update={}",
        installer_version, spicetify_version, has_spicetify_update
    );

    // Reset checking updates flag
    *checking = false;

    Ok(VersionInfo {
        installer_version,
        spicetify_version,
        has_installer_update,
        has_spicetify_update,
    })
}

#[tauri::command]
pub async fn open_faq_url() -> Result<(), String> {
    // Use the system's default browser to open the URL
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
    // Open the download page for the app
    let download_url = "https://github.com/yourusername/spicetify-installer/releases/latest";

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
    // This command helps diagnose where Spicetify might be installed
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
            .creation_flags(0x08000000) // Add this line
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
              .creation_flags(0x08000000) // Add this line
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

    // Check PATH for spicetify
    result.push_str("\nChecking PATH for spicetify:\n");
    let path_check = if cfg!(target_os = "windows") {
        Command::new("cmd")
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