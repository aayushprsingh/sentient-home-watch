import { describe, expect, it } from "vitest";

import { loadSettings, saveSettings, TELEGRAM_BOT_USERNAME } from "@/lib/settings";
import { severityClass, threatColor, threatGlow } from "@/lib/threat";

describe("guardian settings", () => {
  it("falls back to defaults when localStorage is empty or invalid", () => {
    localStorage.clear();
    expect(loadSettings()).toMatchObject({
      homeName: "My Home",
      notifyLevels: { medium: true, high: true },
      presence: "home",
      units: "metric",
    });

    localStorage.setItem("guardian_settings_v2", "not-json");
    expect(loadSettings().homeName).toBe("My Home");
  });

  it("persists settings and emits a change event", () => {
    const changed = new Promise<void>((resolve) => {
      window.addEventListener("guardian-settings-changed", () => resolve(), { once: true });
    });

    saveSettings({
      ...loadSettings(),
      homeName: "Lab Flat",
      city: "Delhi",
      residents: 3,
      presence: "away",
      telegramChatId: "12345",
    });

    expect(loadSettings()).toMatchObject({
      homeName: "Lab Flat",
      city: "Delhi",
      residents: 3,
      presence: "away",
      telegramChatId: "12345",
    });
    return expect(changed).resolves.toBeUndefined();
  });

  it("keeps the public Telegram bot username stable", () => {
    expect(TELEGRAM_BOT_USERNAME).toBe("guardiannaibot");
  });
});

describe("threat presentation helpers", () => {
  it("maps threat levels to theme tokens", () => {
    expect(threatColor("SECURE")).toBe("safe");
    expect(threatColor("CAUTION")).toBe("caution");
    expect(threatColor("ALERT")).toBe("danger");

    expect(threatGlow("SECURE")).toBe("animate-pulse-safe");
    expect(threatGlow("CAUTION")).toBe("animate-pulse-caution");
    expect(threatGlow("ALERT")).toBe("animate-pulse-danger");
  });

  it("normalizes severity classes case-insensitively", () => {
    expect(severityClass("HIGH")).toContain("text-danger");
    expect(severityClass("Medium")).toContain("text-caution");
    expect(severityClass("low")).toContain("text-safe");
    expect(severityClass("")).toContain("text-safe");
  });
});
