import { useCallback, useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  LuDownload,
  LuRefreshCw,
  LuWrench,
  LuArchive,
  LuTrash2,
  LuPlay,
  LuRotateCw,
  LuShieldAlert,
  LuInfo,
} from "react-icons/lu";
import { Header } from "./components/Header";
import { TitleBar } from "./components/TitleBar";
import { ResizeHandles } from "./components/ResizeHandles";
import { Notice } from "./components/Notice";
import { StatusHero, type Recommendation } from "./components/StatusHero";
import { ActionCard } from "./components/ActionCard";
import { OperationPanel } from "./components/OperationPanel";
import { UpdateBanner } from "./components/UpdateBanner";
import { SettingsPanel } from "./components/SettingsPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useStatus } from "./hooks/useStatus";
import { useSettings } from "./hooks/useSettings";
import { useOperation } from "./hooks/useOperation";
import { openExternal } from "./lib/openExternal";
import {
  applySpicetify,
  backupSpotify,
  installInstallerUpdate,
  installSpicetify,
  isTauri,
  repairSpicetify,
  uninstallSpicetify,
} from "./lib/api";
import { version as APP_VERSION } from "../package.json";

export default function App() {
  const { loading, status, spicetifyUpdate, appUpdate, refresh, checkUpdates } = useStatus();
  const { settings, set } = useSettings();
  const op = useOperation();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const systemReduce = useReducedMotion();
  const reduceMotion = settings.reduceMotion || Boolean(systemReduce);

  // After any successful/cancelled operation, re-read the local status AND
  // re-run the update checks so stale "update available" banners clear once the
  // update has actually been applied.
  useEffect(() => {
    if (op.state.phase === "success" || op.state.phase === "cancelled") {
      void refresh().then(checkUpdates);
    }
  }, [op.state.phase, refresh, checkUpdates]);

  const installed = status?.spicetify_installed ?? false;

  const runInstall = () => op.run("Install Spicetify", () => installSpicetify(settings.marketplace));
  const runApply = () => op.run("Apply Spicetify", applySpicetify);
  const runRepair = () => op.run("Repair Spicetify", repairSpicetify);
  const runBackup = () => op.run("Back up Spotify", backupSpotify);
  const runUninstall = () => op.run("Uninstall Spicetify", uninstallSpicetify);
  const runAppUpdate = () => {
    if (!appUpdate?.update_available) return;
    op.run("Update installer", () => installInstallerUpdate(appUpdate.download_url));
  };

  // Recommendation is pure data derived from status; the CTA it maps to is
  // dispatched separately so handlers never go stale inside the memo.
  const recommendation = useMemo(
    () => buildRecommendation(status, spicetifyUpdate?.update_available ?? false),
    [status, spicetifyUpdate],
  );

  const primary = useCallback(() => {
    switch (recommendation.kind) {
      case "getSpotify":
        openExternal("https://www.spotify.com/download/");
        break;
      case "install":
        runInstall();
        break;
      case "apply":
        runApply();
        break;
      case "none":
        break;
    }
    // runInstall/runApply are recreated each render but always read current
    // settings/state, which is exactly what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendation.kind]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    await checkUpdates();
    setRefreshing(false);
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-5 py-6">
      <Header
        appVersion={APP_VERSION}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {!isTauri && (
        <div className="rounded-2xl border border-warn/25 bg-warn/[0.07] px-4 py-3 text-sm text-warn">
          Preview mode — backend actions are unavailable outside the desktop app.
        </div>
      )}

      {!settings.legalAcknowledged && (
        <Notice
          tone="warn"
          icon={LuShieldAlert}
          onDismiss={() => set("legalAcknowledged", true)}
        >
          Spicetify modifies the Spotify desktop client, which may conflict with Spotify's Terms of
          Service, and a Spotify update can occasionally undo its changes. This installer is
          unofficial and not affiliated with Spotify or Spicetify — use it at your own risk.
        </Notice>
      )}

      <UpdateBanner
        app={appUpdate}
        spicetify={spicetifyUpdate}
        onUpdateApp={runAppUpdate}
        onUpdateSpicetify={runInstall}
        reduceMotion={reduceMotion}
      />

      <StatusHero
        loading={loading}
        status={status}
        recommendation={recommendation}
        onPrimary={primary}
        reduceMotion={reduceMotion}
      />

      {status?.spotify_running && (
        <Notice tone="neutral" icon={LuInfo}>
          Spotify is open — it may close and reopen automatically while applying changes.
        </Notice>
      )}

      <section>
        <h2 className="mb-3 px-1 text-sm font-medium uppercase tracking-wide text-faint">
          Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            icon={installed ? LuRefreshCw : LuDownload}
            title={installed ? "Reinstall / Update" : "Install Spicetify"}
            description={
              installed
                ? "Download and apply the latest Spicetify release."
                : "Download the latest Spicetify and set it up."
            }
            onClick={runInstall}
            disabled={!isTauri || !status?.spotify_installed}
            reduceMotion={reduceMotion}
          />
          <ActionCard
            icon={LuPlay}
            title="Apply"
            description="Re-apply Spicetify (fixes a blank UI after a Spotify update)."
            onClick={runApply}
            disabled={!isTauri || !installed}
            reduceMotion={reduceMotion}
          />
          <ActionCard
            icon={LuWrench}
            title="Repair"
            description="Restore, back up, and re-apply to fix a broken install."
            onClick={runRepair}
            disabled={!isTauri || !installed}
            reduceMotion={reduceMotion}
          />
          <ActionCard
            icon={LuArchive}
            title="Backup"
            description="Save a fresh backup of your current Spotify."
            onClick={runBackup}
            disabled={!isTauri || !installed}
            reduceMotion={reduceMotion}
          />
          <ActionCard
            icon={LuTrash2}
            title="Uninstall"
            description="Remove Spicetify and restore Spotify to its original state."
            onClick={() => setConfirmUninstall(true)}
            disabled={!isTauri || !installed}
            danger
            reduceMotion={reduceMotion}
          />
        </div>
      </section>

      <footer className="mt-auto pt-2 text-center text-xs text-faint">
        Unofficial installer · report issues on the project's GitHub, not Spicetify's.
      </footer>

      <OperationPanel
        state={op.state}
        onCancel={op.cancel}
        onRetry={op.retry}
        onClose={op.reset}
        reduceMotion={reduceMotion}
      />

      <ConfirmDialog
        open={confirmUninstall}
        title="Uninstall Spicetify?"
        message="This restores Spotify to its original state and removes all Spicetify files, themes, and extensions. Your Spotify account is unaffected."
        confirmLabel="Uninstall"
        danger
        onConfirm={runUninstall}
        onClose={() => setConfirmUninstall(false)}
        reduceMotion={reduceMotion}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={set}
        appVersion={APP_VERSION}
      />
        </div>
      </div>
      <ResizeHandles />
    </div>
  );
}

function buildRecommendation(
  status: ReturnType<typeof useStatus>["status"],
  spicetifyUpdateAvailable: boolean,
): Recommendation {
  if (!status) {
    return {
      kind: "none",
      tone: "accent",
      headline: "Spicetify control center",
      subtitle: "Connecting to the desktop backend…",
      actionLabel: null,
    };
  }

  if (!status.spotify_installed) {
    return {
      kind: "getSpotify",
      tone: "warn",
      headline: "Spotify isn't installed",
      subtitle:
        "Install the desktop Spotify app first — the Microsoft Store version isn't supported — then come back to add Spicetify.",
      actionLabel: "Get Spotify",
    };
  }

  if (!status.spicetify_installed) {
    return {
      kind: "install",
      tone: "accent",
      headline: "Ready to install Spicetify",
      subtitle: "Spotify was detected. Install Spicetify to start customizing your client.",
      actionLabel: "Install Spicetify",
      actionIcon: LuDownload,
    };
  }

  if (spicetifyUpdateAvailable) {
    return {
      kind: "install",
      tone: "warn",
      headline: "A Spicetify update is available",
      subtitle: "Update to the latest release to get the newest fixes and features.",
      actionLabel: "Update now",
      actionIcon: LuRefreshCw,
    };
  }

  return {
    kind: "apply",
    tone: "accent",
    headline: "Spicetify is up to date",
    subtitle: "Everything looks healthy. Re-apply after a Spotify update, or back up anytime.",
    actionLabel: "Re-apply",
    actionIcon: LuRotateCw,
  };
}
