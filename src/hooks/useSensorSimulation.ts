import { useEffect, useRef, useState } from "react";

// useSensorSimulation
// -------------------
// Simulates 6 home sensors with realistic baseline stability every 3 seconds.
// Detects threshold crossings and produces alerts. The hook also exposes
// trigger functions ("simulate motion", etc.) used by the Sensors tab.

export type SensorKey = "temperature" | "smoke" | "co" | "flood" | "motion" | "door";

export const SENSOR_LABELS: Record<SensorKey, string> = {
  temperature: "Temperature",
  smoke: "Smoke",
  co: "Carbon Monoxide",
  flood: "Flood",
  motion: "Motion",
  door: "Door / Window",
};

export const SENSOR_UNITS: Record<SensorKey, string> = {
  temperature: "°C",
  smoke: "ppm",
  co: "ppm",
  flood: "",
  motion: "",
  door: "",
};

export const THRESHOLDS = {
  temperature: { low: 10, high: 40 },
  smoke: { high: 50 },
  co: { high: 35 },
  flood: { high: 1 },
  motion: { high: 1 },
  // door: 1 = open is treated as caution at night, but we surface as event always
};

export type SensorReading = {
  value: number;
  ts: number;
};

export type SensorState = Record<SensorKey, SensorReading[]>;

export type SensorAlert = {
  id: string;
  ts: number;
  sensor: SensorKey;
  value: number;
  level: "Low" | "Medium" | "High";
  message: string;
};

export type ThreatLevelComputed = "SECURE" | "CAUTION" | "ALERT";

const initialReading = (k: SensorKey): number => {
  switch (k) {
    case "temperature": return 22;
    case "smoke": return 5;
    case "co": return 2;
    case "flood": return 0;
    case "motion": return 0;
    case "door": return 0;
  }
};

const evaluate = (k: SensorKey, v: number): { level: "Low" | "Medium" | "High" | null; msg: string } => {
  if (k === "temperature") {
    if (v >= THRESHOLDS.temperature.high) return { level: "High", msg: `Temperature critically high: ${v.toFixed(1)}°C` };
    if (v <= THRESHOLDS.temperature.low) return { level: "Medium", msg: `Temperature below safe range: ${v.toFixed(1)}°C` };
    return { level: null, msg: "" };
  }
  if (k === "smoke" && v >= THRESHOLDS.smoke.high) return { level: "High", msg: `Smoke detected: ${v.toFixed(0)} ppm` };
  if (k === "co" && v >= THRESHOLDS.co.high) return { level: "High", msg: `Carbon monoxide elevated: ${v.toFixed(0)} ppm` };
  if (k === "flood" && v >= 1) return { level: "High", msg: "Water / flood sensor triggered" };
  if (k === "motion" && v >= 1) return { level: "Medium", msg: "Motion detected" };
  if (k === "door" && v >= 1) return { level: "Medium", msg: "Door / window opened" };
  return { level: null, msg: "" };
};

export function useSensorSimulation(onThreshold?: (alert: SensorAlert) => void) {
  const [readings, setReadings] = useState<SensorState>(() => {
    const o: Partial<SensorState> = {};
    (Object.keys(SENSOR_LABELS) as SensorKey[]).forEach((k) => {
      o[k] = [{ value: initialReading(k), ts: Date.now() }];
    });
    return o as SensorState;
  });
  const [alerts, setAlerts] = useState<SensorAlert[]>([]);
  const temperatureBaselineRef = useRef(22);
  const lastValuesRef = useRef<Record<SensorKey, number>>({
    temperature: 22, smoke: 5, co: 2, flood: 0, motion: 0, door: 0,
  });
  // Latch: once an alert fires for a sensor, don't re-fire until it returns to "safe" state.
  const alertedRef = useRef<Record<SensorKey, boolean>>({
    temperature: false, smoke: false, co: false, flood: false, motion: false, door: false,
  });
  const onThresholdRef = useRef(onThreshold);
  onThresholdRef.current = onThreshold;

  const pushReading = (k: SensorKey, value: number) => {
    setReadings((prev) => {
      const arr = [...(prev[k] ?? []), { value, ts: Date.now() }].slice(-30);
      return { ...prev, [k]: arr };
    });

    lastValuesRef.current[k] = value;
    const ev = evaluate(k, value);
    if (ev.level) {
      // Only fire on rising edge (not already alerted)
      if (!alertedRef.current[k]) {
        alertedRef.current[k] = true;
        const alert: SensorAlert = {
          id: `${k}-${Date.now()}`,
          ts: Date.now(),
          sensor: k,
          value,
          level: ev.level,
          message: ev.msg,
        };
        setAlerts((prev) => [alert, ...prev].slice(0, 50));
        onThresholdRef.current?.(alert);
      }
    } else {
      // Returned to safe — reset latch so next trigger will alert again
      alertedRef.current[k] = false;
    }
  };

  // Auto-tick every 3s. Normal readings stay stable; triggered values recover slowly.
  useEffect(() => {
    const id = setInterval(() => {
      const cur = lastValuesRef.current;
      // Temperature and gas values remain flat at baseline and recover slowly after simulated spikes.
      pushReading("temperature", nextTemperature(cur.temperature, temperatureBaselineRef.current));
      pushReading("smoke", recoverToBaseline(cur.smoke, 5, 6, 0));
      pushReading("co", recoverToBaseline(cur.co, 2, 4, 0));
      // Motion auto-clears after one tick; no random firing.
      pushReading("motion", cur.motion > 0 ? 0 : 0);
      // Flood and door stay until manually toggled.
      pushReading("flood", cur.flood);
      pushReading("door", cur.door);
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute overall threat level from recent alerts
  const recent = alerts.slice(0, 5);
  let threat: ThreatLevelComputed = "SECURE";
  if (recent.some((a) => a.level === "High" && Date.now() - a.ts < 60000)) threat = "ALERT";
  else if (recent.some((a) => Date.now() - a.ts < 60000)) threat = "CAUTION";

  // Public triggers
  const trigger = {
    motion: () => pushReading("motion", 1),
    smoke: () => pushReading("smoke", 80),
    co: () => pushReading("co", 50),
    flood: () => pushReading("flood", 1),
    door: () => pushReading("door", lastValuesRef.current.door > 0 ? 0 : 1),
    tempHigh: () => pushReading("temperature", 45),
    setOutdoorTemperature: (value: number) => {
      const next = Number(clamp(value, -5, 50).toFixed(1));
      temperatureBaselineRef.current = next;
      pushReading("temperature", next);
    },
    reset: () => {
      temperatureBaselineRef.current = 22;
      lastValuesRef.current = { temperature: 22, smoke: 5, co: 2, flood: 0, motion: 0, door: 0 };
    },
  };

  const clearAlerts = () => setAlerts([]);

  return { readings, alerts, threat, trigger, clearAlerts };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function nextTemperature(current: number, baseline: number) {
  if (Math.abs(current - baseline) < 0.1) return baseline;
  const step = current > baseline ? -0.2 : 0.2;
  return Number(clamp(current + step, -5, 50).toFixed(1));
}

function recoverToBaseline(current: number, baseline: number, step: number, decimals: number) {
  if (Math.abs(current - baseline) <= step) return baseline;
  const next = current > baseline ? current - step : current + step;
  return Number(clamp(next, 0, 100).toFixed(decimals));
}
