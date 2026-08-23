import { LuSettings, LuRefreshCw } from "react-icons/lu";
import { Button } from "./ui/Button";
import { Tooltip } from "./ui/Tooltip";
import logo from "../assets/img/logo-spicetify.png";

interface HeaderProps {
  appVersion: string;
  onOpenSettings: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function Header({ appVersion, onOpenSettings, onRefresh, refreshing }: HeaderProps) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="relative">
          <img src={logo} alt="" className="size-10 rounded-xl" />
          <div className="absolute inset-0 -z-10 rounded-xl bg-accent/30 blur-lg" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none tracking-tight">Spicetify Installer</h1>
          <p className="mt-1 text-xs text-faint">
            Manage Spicetify · v{appVersion}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip label="Refresh status">
          <Button variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh status">
            <LuRefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </Tooltip>
        <Tooltip label="Settings">
          <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-label="Settings">
            <LuSettings className="size-4" />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
