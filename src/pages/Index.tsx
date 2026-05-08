import { useEffect, useState } from "react";
import { GuardianSidebar, TabKey } from "@/components/GuardianSidebar";
import { GuardianHeader } from "@/components/GuardianHeader";
import { useSensorSimulation } from "@/hooks/useSensorSimulation";
import { ChatTab } from "@/components/tabs/ChatTab";
import { SensorsTab } from "@/components/tabs/SensorsTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { DashboardStrip } from "@/components/DashboardStrip";
import { callFn } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { loadSettings, saveSettings } from "@/lib/settings";

interface Geo { city?: string; country?: string; lat?: number; lon?: number; }
interface WeatherResponse { weather?: { description?: string; temp?: number } }

const Index = () => {
  const [tab, setTab] = useState<TabKey>("chat");
  const [geo, setGeo] = useState<Geo>({});
  const [weatherCondition, setWeatherCondition] = useState<string | undefined>();
  const settings = useSettings();

  // Send Telegram alert when a sensor triggers (filtered by user prefs + presence + quiet hours).
  const handleAlert = (a: import("@/hooks/useSensorSimulation").SensorAlert) => {
    // Suppress motion/door alerts when owner is home (they're moving around themselves).
    if (settings.presence === "home" && (a.sensor === "motion" || a.sensor === "door")) return;
    if (!settings.telegramChatId) return;
    const lvl = (a.level || "").toLowerCase() as "low" | "medium" | "high";
    if (!settings.notifyLevels[lvl]) return;
    if (settings.quietHoursEnabled && inQuietHours(settings.quietStart, settings.quietEnd)) return;

    callFn("telegram-alert", {
      chatId: settings.telegramChatId,
      message: `🚨 <b>Guardian AI</b>\n${a.message}\nLevel: ${a.level}\n${new Date(a.ts).toLocaleTimeString()}`,
    }).catch(() => {});
  };

  const { readings, alerts, threat, trigger } = useSensorSimulation(handleAlert);

  // Detect approximate location once on load
  useEffect(() => {
    callFn<Geo>("geolocate").then(setGeo).catch(() => {});
  }, []);

  // Fetch weather once we have coords
  useEffect(() => {
    if (!geo.lat || !geo.lon) return;
    callFn<WeatherResponse>("weather", { lat: geo.lat, lon: geo.lon })
      .then((d) => {
        setWeatherCondition(d.weather?.description);
        if (typeof d.weather?.temp === "number") {
          trigger.setOutdoorTemperature(d.weather.temp);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.lat, geo.lon]);

  const locationLabel = settings.city || (geo.city ? `${geo.city}${geo.country ? ", " + geo.country : ""}` : undefined);

  return (
    <div className="min-h-screen flex w-full">
      <GuardianSidebar active={tab} onChange={setTab} />
      <div className="flex-1 flex flex-col min-w-0">
        <GuardianHeader
          threat={threat}
          location={locationLabel}
          presence={settings.presence}
          onTogglePresence={() => {
            const cur = loadSettings();
            saveSettings({ ...cur, presence: cur.presence === "home" ? "away" : "home" });
          }}
        />
        <main className="flex-1 px-3 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
          {tab === "chat" && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <ChatTab
                location={locationLabel}
                weatherCondition={weatherCondition}
                presence={settings.presence}
                readings={readings}
                alerts={alerts}
                threat={threat}
              />
              <DashboardStrip readings={readings} alerts={alerts} threat={threat} />
            </div>
          )}
          {tab === "sensors" && <SensorsTab readings={readings} alerts={alerts} trigger={trigger} />}
          {tab === "settings" && <SettingsTab />}
        </main>
      </div>
    </div>
  );
};

function inQuietHours(start: string, end: string) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

export default Index;
