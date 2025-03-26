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

async fn check_github_release() -> Result<(String, String), String> {
    Ok(("1.1.0".to_string(), "https://github.com/FIREPAWER07/spicetify-installer/releases/download/v1.1.0/spicetify-installer-1.1.0-setup.exe".to_string()))
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

    let output = execute_with_progress(command, app_handle).await?;

    Ok(output)
}

async fn execute_with_progress(command: String, app_handle: AppHandle) -> Result<String, String> {
    let app_handle_clone = app_handle.clone();

    app_handle.emit("progress_update", 0).unwrap();

    let output = Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &command,
        ])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    println!("Command output: {}", stdout);
    if !stderr.is_empty() {
        println!("Command error: {}", stderr);
    }

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

    let _ = progress_handle.await;

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
    let temp_dir = env::temp_dir();
    let install_script_path = temp_dir.join("spicetify_direct_install.ps1");

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
        Err(format!("Spicetify installation failed: {}", stderr))
    }
}

#[tauri::command]
pub async fn check_versions() -> Result<VersionInfo, String> {
    if CHECKING_UPDATES
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Already checking for updates".to_string());
    }

    let installer_version = "1.0.1".to_string();

    println!("Checking Spicetify version using direct cmd approach...");
    let cmd_output = Command::new("cmd")
        .creation_flags(0x08000000)
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

    let spicetify_version = if spicetify_version.is_none() {
        println!("Trying fallback PowerShell approach...");
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

    let has_spicetify_update = if let Some(current_version) = &spicetify_version {
        !current_version.starts_with("2.")
    } else {
        false
    };

    let (latest_version, download_url) = match check_github_release().await {
        Ok((v, url)) => (Some(v), Some(url)),
        Err(e) => {
            println!("Error checking GitHub: {}", e);
            (None, None)
        }
    };

    let has_installer_update = if let Some(latest) = &latest_version {
        latest != &installer_version
    } else {
        false
    };

    println!(
        "Final version info: installer={}, spicetify={:?}, has_update={}",
        installer_version, spicetify_version, has_spicetify_update
    );

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
    
    let download_url = version_info.latest_installer_url
        .ok_or("No download URL available")?;
    
    let temp_dir = env::temp_dir();
    let filename = download_url.split('/').last().unwrap_or("spicetify-installer-update.exe");
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
