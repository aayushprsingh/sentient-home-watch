import { describe, expect, it } from "vitest";

import { severityClass, threatColor, threatGlow, type ThreatLevel } from "@/lib/threat";

const levels: Array<{
  level: ThreatLevel;
  color: string;
  glow: string;
}> = [
  { level: "SECURE", color: "safe", glow: "animate-pulse-safe" },
  { level: "CAUTION", color: "caution", glow: "animate-pulse-caution" },
  { level: "ALERT", color: "danger", glow: "animate-pulse-danger" },
];

describe("threat helpers", () => {
  it.each(levels)("maps $level to the expected visual tokens", ({ level, color, glow }) => {
    expect(threatColor(level)).toBe(color);
    expect(threatGlow(level)).toBe(glow);
  });

  it("maps alert severity text to badge classes case-insensitively", () => {
    expect(severityClass("HIGH")).toContain("text-danger");
    expect(severityClass("Medium")).toContain("text-caution");
    expect(severityClass("low")).toContain("text-safe");
  });

  it("treats missing severity as safe styling", () => {
    expect(severityClass("")).toContain("text-safe");
  });
});
