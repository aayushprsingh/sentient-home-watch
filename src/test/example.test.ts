import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { loadSettings, saveSettings, TELEGRAM_BOT_USERNAME } from "@/lib/settings";
import { severityClass, threatColor, threatGlow } from "@/lib/threat";
import {
  loadStoredChatHistory, saveStoredChatHistory, clearStoredChatHistory,
  loadHouseMemory, saveRoomSnapshot, deleteRoomSnapshot, clearHouseMemory,
  recordMotionDemoEvent,
  type StoredChatMessage,
} from "@/lib/guardianMemory";

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

  it("returns safe class for null and undefined", () => {
    expect(severityClass(null)).toContain("text-safe");
    expect(severityClass(undefined)).toContain("text-safe");
  });
});

describe("guardianMemory", () => {
  const TEST_ROOM = {
    roomName: "Test Room",
    tags: ["kitchen"],
    notes: "Small",
    imageDataUrl: "data:image/png;base64,test",
  };

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("chat history", () => {
    it("returns empty array when no history stored", () => {
      localStorage.removeItem("guardian_chat_history_v1");
      expect(loadStoredChatHistory()).toEqual([]);
    });

    it("loads parsed messages from localStorage", () => {
      const messages: StoredChatMessage[] = [
        { role: "user", content: "hello", ts: 1000 },
        { role: "assistant", content: "hi", ts: 2000 },
      ];
      localStorage.setItem("guardian_chat_history_v1", JSON.stringify(messages));
      expect(loadStoredChatHistory()).toEqual(messages);
    });

    it("returns empty array on corrupted JSON", () => {
      localStorage.setItem("guardian_chat_history_v1", "not json");
      expect(loadStoredChatHistory()).toEqual([]);
    });

    it("saves messages to localStorage capped at 60", () => {
      const msgs = Array.from({ length: 70 }, (_, i) => ({
        role: "user" as const, content: `msg${i}`, ts: i,
      }));
      saveStoredChatHistory(msgs);
      const stored = JSON.parse(localStorage.getItem("guardian_chat_history_v1")!) as StoredChatMessage[];
      expect(stored).toHaveLength(60);
      expect(stored[0].content).toBe("msg10"); // last 60 of 70
    });

    it("dispatches memory change event when saving", () => {
      saveStoredChatHistory([{ role: "user", content: "test", ts: 1 }]);
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "guardian-memory-changed" })
      );
    });

    it("clears chat history and dispatches event", () => {
      localStorage.setItem("guardian_chat_history_v1", "[]");
      clearStoredChatHistory();
      expect(localStorage.getItem("guardian_chat_history_v1")).toBeNull();
      expect(window.dispatchEvent).toHaveBeenCalled();
    });
  });

  describe("house memory", () => {
    it("returns empty rooms and events when nothing stored", () => {
      localStorage.removeItem("guardian_house_memory_v1");
      const mem = loadHouseMemory();
      expect(mem.rooms).toEqual([]);
      expect(mem.motionEvents).toEqual([]);
    });

    it("loads and validates stored rooms and events", () => {
      const stored = { rooms: [{ id: "1", roomName: "Living", tags: [], notes: "", imageDataUrl: "", createdAt: 1, updatedAt: 1 }], motionEvents: [] };
      localStorage.setItem("guardian_house_memory_v1", JSON.stringify(stored));
      const mem = loadHouseMemory();
      expect(mem.rooms).toHaveLength(1);
      expect(mem.rooms[0].roomName).toBe("Living");
    });

    it("saves a new room and assigns id + timestamps", () => {
      const room = saveRoomSnapshot(TEST_ROOM);
      expect(room.id).toBeTruthy();
      expect(room.createdAt).toBeDefined();
      expect(room.updatedAt).toBeDefined();
      expect(loadHouseMemory().rooms).toHaveLength(1);
    });

    it("updates existing room on re-save with same id", () => {
      const first = saveRoomSnapshot(TEST_ROOM);
      const updated = saveRoomSnapshot({ ...TEST_ROOM, id: first.id, notes: "Updated notes" });
      expect(updated.id).toBe(first.id);
      expect(loadHouseMemory().rooms).toHaveLength(1);
      expect(loadHouseMemory().rooms[0].notes).toBe("Updated notes");
    });

    it("caps rooms at 12 and keeps newest", () => {
      for (let i = 0; i < 14; i++) {
        saveRoomSnapshot({ ...TEST_ROOM, roomName: `Room ${i}` });
      }
      const rooms = loadHouseMemory().rooms;
      expect(rooms).toHaveLength(12);
      expect(rooms[0].roomName).toBe("Room 13"); // most recent first
    });

    it("deletes room and its motion events", () => {
      const room = saveRoomSnapshot(TEST_ROOM);
      recordMotionDemoEvent({ roomId: room.id, roomName: room.roomName, personDetected: false, shouldAlert: false, roomMatch: true, confidence: "High", summary: "test" });
      deleteRoomSnapshot(room.id);
      const mem = loadHouseMemory();
      expect(mem.rooms).toHaveLength(0);
      expect(mem.motionEvents).toHaveLength(0);
    });

    it("clears all house memory and dispatches event", () => {
      saveRoomSnapshot(TEST_ROOM);
      clearHouseMemory();
      expect(loadHouseMemory().rooms).toHaveLength(0);
      expect(window.dispatchEvent).toHaveBeenCalled();
    });

    it("records motion demo events capped at 20", () => {
      for (let i = 0; i < 22; i++) {
        recordMotionDemoEvent({ roomId: "r1", roomName: "Room", personDetected: false, shouldAlert: false, roomMatch: true, confidence: "Medium", summary: `e${i}` });
      }
      const events = loadHouseMemory().motionEvents;
      expect(events).toHaveLength(20);
      expect(events[0].summary).toBe("e21"); // newest first
    });
  });
});
