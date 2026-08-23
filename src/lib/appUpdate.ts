import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "./api";

export interface AppUpdateInfo {
  available: boolean;
  version: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number | null;
}

/**
 * Ask Tauri's updater whether a newer, signed release is published. Returns null
 * when unavailable (preview mode, offline, or no manifest yet).
 */
export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isTauri) return null;
  try {
    const update = await check();
    return update ? { available: true, version: update.version } : { available: false, version: "" };
  } catch (e) {
    console.warn("App update check failed:", e);
    return null;
  }
}

/**
 * Download, verify (signature), and install the latest release via Tauri's
 * updater, reporting byte progress, then relaunch into the new version.
 */
export async function performAppUpdate(
  onProgress: (p: DownloadProgress) => void,
  onStage: (stage: string) => void,
): Promise<string> {
  if (!isTauri) throw new Error("Updates are only available in the desktop app");

  onStage("Checking");
  const update = await check();
  if (!update) return "You're already on the latest version";

  let total: number | null = null;
  let downloaded = 0;
  onStage("Downloading");

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress({ downloaded: 0, total });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress({ downloaded, total });
        break;
      case "Finished":
        onStage("Installing");
        break;
    }
  });

  await relaunch();
  return `Updated to v${update.version}. Restarting…`;
}
