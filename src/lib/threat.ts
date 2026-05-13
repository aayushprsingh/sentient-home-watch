// Threat level helpers shared across the app
export type ThreatLevel = "SECURE" | "CAUTION" | "ALERT";

export const threatColor = (level: ThreatLevel) => {
  switch (level) {
    case "SECURE": return "safe";
    case "CAUTION": return "caution";
    case "ALERT": return "danger";
  }
};

export const threatGlow = (level: ThreatLevel) => {
  switch (level) {
    case "SECURE": return "animate-pulse-safe";
    case "CAUTION": return "animate-pulse-caution";
    case "ALERT": return "animate-pulse-danger";
  }
};

export const severityClass = (sev: string | null | undefined) => {
  if (sev == null) return "bg-safe/15 text-safe border-safe/40";
  const s = sev.toLowerCase();
  if (s === "high") return "bg-danger/15 text-danger border-danger/40";
  if (s === "medium") return "bg-caution/15 text-caution border-caution/40";
  return "bg-safe/15 text-safe border-safe/40";
};
