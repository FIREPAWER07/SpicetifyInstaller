import { useCallback, useEffect, useState } from "react";
import {
  checkInstallerUpdate,
  checkSpicetifyUpdate,
  getStatus,
  isTauri,
  type InstallerUpdate,
  type SpicetifyUpdate,
  type Status,
} from "../lib/api";

export interface StatusState {
  loading: boolean;
  status: Status | null;
  spicetifyUpdate: SpicetifyUpdate | null;
  appUpdate: InstallerUpdate | null;
  error: string | null;
}

/**
 * Loads the environment snapshot plus update availability. `refresh` re-reads
 * the local status quickly; update checks (network) run once on mount and on
 * explicit demand so the dashboard stays responsive after operations.
 */
export function useStatus() {
  const [state, setState] = useState<StatusState>({
    loading: true,
    status: null,
    spicetifyUpdate: null,
    appUpdate: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!isTauri) {
      setState((s) => ({ ...s, loading: false, error: "preview" }));
      return;
    }
    try {
      const status = await getStatus();
      setState((s) => ({ ...s, status, loading: false, error: null }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }, []);

  const checkUpdates = useCallback(async () => {
    if (!isTauri) return;
    const [spice, app] = await Promise.allSettled([
      checkSpicetifyUpdate(),
      checkInstallerUpdate(),
    ]);
    setState((s) => ({
      ...s,
      spicetifyUpdate: spice.status === "fulfilled" ? spice.value : s.spicetifyUpdate,
      appUpdate: app.status === "fulfilled" ? app.value : s.appUpdate,
    }));
  }, []);

  useEffect(() => {
    void refresh().then(checkUpdates);
  }, [refresh, checkUpdates]);

  return { ...state, refresh, checkUpdates };
}
