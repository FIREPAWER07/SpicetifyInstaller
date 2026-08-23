import { motion } from "framer-motion";
import {
  LuCircleCheck,
  LuCircleAlert,
  LuCircleX,
  LuMusic,
  LuArchive,
  LuArrowRight,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";
import type { Status } from "../lib/api";

export type Tone = "success" | "warn" | "danger" | "accent";

/** Which primary action the hero's CTA triggers. */
export type RecommendationKind = "none" | "getSpotify" | "install" | "apply";

export interface Recommendation {
  kind: RecommendationKind;
  tone: Tone;
  headline: string;
  subtitle: string;
  actionLabel: string | null;
  actionIcon?: IconType;
  disabled?: boolean;
}

interface StatusHeroProps {
  loading: boolean;
  status: Status | null;
  recommendation: Recommendation;
  onPrimary: () => void;
  reduceMotion?: boolean;
}

const toneGlow: Record<Tone, string> = {
  success: "rgba(69,194,129,0.20)",
  warn: "rgba(224,161,58,0.20)",
  danger: "rgba(229,96,79,0.20)",
  accent: "rgba(235,90,55,0.22)",
};

function Pill({
  icon: Icon,
  label,
  tone,
}: {
  icon: IconType;
  label: string;
  tone: Tone | "muted";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : tone === "accent"
            ? "text-accent"
            : "text-faint";
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2">
      <Icon className={cn("size-4 shrink-0", color)} />
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}

export function StatusHero({
  loading,
  status,
  recommendation,
  onPrimary,
  reduceMotion,
}: StatusHeroProps) {
  const Action = recommendation.actionIcon ?? LuArrowRight;

  return (
    <Card className="relative overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(circle, ${toneGlow[recommendation.tone]}, transparent 70%)`,
        }}
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <motion.h2
            key={recommendation.headline}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-2xl font-bold tracking-tight"
          >
            {loading ? "Checking your setup…" : recommendation.headline}
          </motion.h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            {loading ? "Reading Spicetify and Spotify status." : recommendation.subtitle}
          </p>

          {recommendation.actionLabel && (
            <Button
              variant="primary"
              size="lg"
              className="mt-5"
              onClick={onPrimary}
              disabled={loading || recommendation.disabled}
            >
              <Action className="size-4.5" />
              {recommendation.actionLabel}
            </Button>
          )}
        </div>

        <div className="grid shrink-0 gap-2 md:w-64">
          <Pill
            icon={
              status?.spicetify_installed ? LuCircleCheck : loading ? LuCircleAlert : LuCircleX
            }
            tone={status?.spicetify_installed ? "success" : loading ? "muted" : "danger"}
            label={
              status?.spicetify_installed
                ? `Spicetify v${cleanVersion(status.spicetify_version)}`
                : "Spicetify not installed"
            }
          />
          <Pill
            icon={LuMusic}
            tone={
              status?.spotify_installed ? (status.spotify_running ? "accent" : "success") : "warn"
            }
            label={
              status?.spotify_installed
                ? status.spotify_running
                  ? "Spotify is running"
                  : "Spotify installed"
                : "Spotify not found"
            }
          />
          <Pill
            icon={LuArchive}
            tone={status?.has_backup ? "success" : "muted"}
            label={status?.has_backup ? "Backup present" : "No backup yet"}
          />
        </div>
      </div>
    </Card>
  );
}

function cleanVersion(v: string | null): string {
  if (!v) return "?";
  const m = v.match(/\d+\.\d+\.\d+/);
  return m ? m[0] : v.replace(/^v/, "");
}
