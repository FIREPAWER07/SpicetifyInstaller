import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./api";

/** Open a URL in the user's default browser (native when available). */
export function openExternal(url: string) {
  if (isTauri) void openUrl(url);
  else window.open(url, "_blank");
}
