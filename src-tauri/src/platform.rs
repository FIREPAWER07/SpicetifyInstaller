//! Native Windows helpers: user PATH editing via the registry and process
//! detection via the Toolhelp snapshot API. No shell/PowerShell involved.
//!
//! Non-Windows builds get inert stubs so the crate still type-checks.

use crate::error::AppResult;
use std::path::Path;

#[cfg(windows)]
pub fn add_to_user_path(dir: &Path) -> AppResult<bool> {
    use crate::error::AppError;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ};
    use winreg::{RegKey, RegValue};

    let dir_str = dir.to_string_lossy().to_string();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env = hkcu
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| AppError::Io(format!("Failed to open user environment: {e}")))?;

    let current: String = env.get_value("Path").unwrap_or_default();

    // Already present (case-insensitive, tolerate trailing separators).
    let present = current
        .split(';')
        .map(|s| s.trim().trim_end_matches('\\'))
        .any(|s| s.eq_ignore_ascii_case(dir_str.trim_end_matches('\\')));
    if present {
        return Ok(false);
    }

    let sep = if current.is_empty() || current.ends_with(';') {
        ""
    } else {
        ";"
    };
    let new_path = format!("{current}{sep}{dir_str}");

    env.set_raw_value(
        "Path",
        &RegValue {
            vtype: REG_EXPAND_SZ,
            bytes: encode_utf16(&new_path),
        },
    )
    .map_err(|e| AppError::Io(format!("Failed to update PATH: {e}")))?;

    broadcast_env_change();
    Ok(true)
}

#[cfg(windows)]
pub fn remove_from_user_path(dir: &Path) -> AppResult<bool> {
    use crate::error::AppError;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ};
    use winreg::{RegKey, RegValue};

    let dir_str = dir.to_string_lossy().to_string();
    let target = dir_str.trim_end_matches('\\').to_ascii_lowercase();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let env = hkcu
        .open_subkey_with_flags("Environment", KEY_READ | KEY_WRITE)
        .map_err(|e| AppError::Io(format!("Failed to open user environment: {e}")))?;

    let current: String = env.get_value("Path").unwrap_or_default();
    let kept: Vec<&str> = current
        .split(';')
        .filter(|s| !s.trim().is_empty())
        .filter(|s| s.trim().trim_end_matches('\\').to_ascii_lowercase() != target)
        .collect();

    let new_path = kept.join(";");
    if new_path == current {
        return Ok(false);
    }

    env.set_raw_value(
        "Path",
        &RegValue {
            vtype: REG_EXPAND_SZ,
            bytes: encode_utf16(&new_path),
        },
    )
    .map_err(|e| AppError::Io(format!("Failed to update PATH: {e}")))?;

    broadcast_env_change();
    Ok(true)
}

#[cfg(windows)]
fn encode_utf16(s: &str) -> Vec<u8> {
    s.encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(|u| u.to_le_bytes())
        .collect()
}

/// Notify running processes that the environment changed so new shells pick up
/// the updated PATH without a logout. Best-effort; failure is non-fatal.
#[cfg(windows)]
fn broadcast_env_change() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };
    let param: Vec<u16> = "Environment\0".encode_utf16().collect();
    let mut result: usize = 0;
    unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            param.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            &mut result,
        );
    }
}

/// Return true if a process with the given executable name is running.
#[cfg(windows)]
pub fn process_running(exe_name: &str) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot as isize == -1 || snapshot.is_null() {
            return false;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut found = false;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let name = String::from_utf16_lossy(
                    &entry.szExeFile[..entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len())],
                );
                if name.eq_ignore_ascii_case(exe_name) {
                    found = true;
                    break;
                }
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        found
    }
}

// ---- Non-Windows stubs -------------------------------------------------------

#[cfg(not(windows))]
pub fn add_to_user_path(_dir: &Path) -> AppResult<bool> {
    Ok(false)
}
#[cfg(not(windows))]
pub fn remove_from_user_path(_dir: &Path) -> AppResult<bool> {
    Ok(false)
}
#[cfg(not(windows))]
pub fn process_running(_exe_name: &str) -> bool {
    false
}
