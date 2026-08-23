import { motion } from "framer-motion";
import { LuCircleArrowUp, LuSparkles } from "react-icons/lu";
import { Button } from "./ui/Button";
import type { SpicetifyUpdate } from "../lib/api";
import type { AppUpdateInfo } from "../lib/appUpdate";

interface UpdateBannerProps {
  app: AppUpdateInfo | null;
  spicetify: SpicetifyUpdate | null;
  onUpdateApp: () => void;
  onUpdateSpicetify: () => void;
  reduceMotion?: boolean;
}

export function UpdateBanner({
  app,
  spicetify,
  onUpdateApp,
  onUpdateSpicetify,
  reduceMotion,
}: UpdateBannerProps) {
  const appUpdate = app?.available ? app : null;
  const spiceUpdate = spicetify?.update_available ? spicetify : null;
  if (!appUpdate && !spiceUpdate) return null;

  // Prefer surfacing the app update; Spicetify updates are also reachable from
  // the action grid, so only one banner shows at a time.
  const isApp = Boolean(appUpdate);
  const version = isApp ? appUpdate!.version : spiceUpdate!.latest_version;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center justify-between gap-4 rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
          {isApp ? <LuCircleArrowUp className="size-5" /> : <LuSparkles className="size-5" />}
        </span>
        <div>
          <p className="text-sm font-medium">
            {isApp ? "A new version of the installer is available" : "A Spicetify update is available"}
          </p>
          <p className="text-xs text-faint">Latest: v{version}</p>
        </div>
      </div>
      <Button variant="primary" size="sm" onClick={isApp ? onUpdateApp : onUpdateSpicetify}>
        {isApp ? "Update app" : "Update Spicetify"}
      </Button>
    </motion.div>
  );
}
