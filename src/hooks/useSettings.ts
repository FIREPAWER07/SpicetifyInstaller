import { useCallback, useEffect, useState } from "react";

export interface Settings {
  /** Install the Spicetify Marketplace alongside the CLI. */
  marketplace: boolean;
  /** Force-disable animations regardless of the OS preference. */
  reduceMotion: boolean;
  /** Whether the user has dismissed the first-run legal/ToS notice. */
  legalAcknowledged: boolean;
}

const KEY = "spicetify-installer.settings";

const DEFAULTS: Settings = {
  marketplace: true,
  reduceMotion: false,
  legalAcknowledged: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [settings]);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  return { settings, set };
}
