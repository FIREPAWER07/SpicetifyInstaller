import type { ReactNode } from "react";
import { LuExternalLink, LuGithub, LuBookOpen, LuCircleHelp } from "react-icons/lu";
import { Modal } from "./ui/Modal";
import { Switch } from "./ui/Switch";
import { openExternal } from "../lib/openExternal";
import type { Settings } from "../hooks/useSettings";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  appVersion: string;
}

const LINKS = [
  { label: "Getting started", url: "https://spicetify.app/docs/getting-started", icon: LuBookOpen },
  { label: "Spicetify FAQ", url: "https://spicetify.app/docs/faq/", icon: LuCircleHelp },
  { label: "Installer on GitHub", url: "https://github.com/FIREPAWER07/SpicetifyInstaller", icon: LuGithub },
];

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-faint">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel({
  open,
  onClose,
  settings,
  onChange,
  appVersion,
}: SettingsPanelProps) {
  return (
    <Modal open={open} onClose={onClose} title="Settings" reduceMotion={settings.reduceMotion}>
      <div className="divide-y divide-line">
        <Row
          title="Install Marketplace"
          description="Add the Spicetify Marketplace during installation."
        >
          <Switch
            label="Install Marketplace"
            checked={settings.marketplace}
            onChange={(v) => onChange("marketplace", v)}
          />
        </Row>
        <Row title="Reduce motion" description="Minimize animations and transitions.">
          <Switch
            label="Reduce motion"
            checked={settings.reduceMotion}
            onChange={(v) => onChange("reduceMotion", v)}
          />
        </Row>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-faint">Resources</p>
        <div className="grid gap-1">
          {LINKS.map((l) => (
            <button
              key={l.url}
              onClick={() => openExternal(l.url)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-fg"
            >
              <l.icon className="size-4 text-faint" />
              <span className="flex-1 text-left">{l.label}</span>
              <LuExternalLink className="size-3.5 text-faint" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-white/[0.02] p-3">
        <p className="text-xs leading-relaxed text-faint">
          <span className="font-medium text-muted">Disclaimer:</span> Spicetify modifies the Spotify
          desktop client, which may conflict with Spotify's Terms of Service. This tool is
          unofficial and not affiliated with Spotify or Spicetify. It's provided as-is, with no
          warranty — use it at your own risk. Report issues on the installer's GitHub, not
          Spicetify's.
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-faint">
        Spicetify Installer v{appVersion} · Unofficial · not affiliated with Spicetify
      </p>
    </Modal>
  );
}
