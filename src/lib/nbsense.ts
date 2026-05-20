// Server-side helper for fetching nbsense temp/humidity with a 60s cache.

export interface NbsenseReading {
    temperature: number;
    humidity: number;
    last_seen: string;
    location: string;
    sensor_name: string;
    status: string;
    daily_avg_temp: string;
    daily_max_temp: string;
    daily_max_temp_time: string;
    daily_min_temp: string;
    daily_min_temp_time: string;
    daily_avg_humidity: string;
    daily_max_humidity: string;
    daily_max_humidity_time: string;
    daily_min_humidity: string;
    daily_min_humidity_time: string;
    monthly_avg_temp: string;
    monthly_max_temp: string;
    monthly_max_temp_date: string;
    monthly_min_temp: string;
    monthly_min_temp_date: string;
    monthly_avg_humidity: string;
    monthly_max_humidity: string;
    monthly_max_humidity_date: string;
    monthly_min_humidity: string;
    monthly_min_humidity_date: string;
}

const CACHE_TTL_MS = 60_000;
let cached: { data: NbsenseReading; fetchedAt: number } | null = null;
let inflight: Promise<NbsenseReading> | null = null;

export const NBSENSE_VIRTUAL_MAC = "NBSENSE";

export async function fetchNbsenseLatest(): Promise<NbsenseReading> {
    const now = Date.now();
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
    }
    if (inflight) return inflight;

    const token = process.env.NBSENSE_BEARER_TOKEN;
    const meterId = process.env.NBSENSE_METER_ID || "1602";
    const sensorName = process.env.NBSENSE_SENSOR_NAME || "161";

    if (!token) {
        throw new Error("NBSENSE_BEARER_TOKEN is not set in environment");
    }

    const url = `https://api.nbsense.in/th_ms/get_latest_data?meter_id=${encodeURIComponent(meterId)}&sensor_name=${encodeURIComponent(sensorName)}`;

    inflight = (async () => {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        });
        if (!res.ok) {
            throw new Error(`nbsense API ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as NbsenseReading;
        cached = { data, fetchedAt: Date.now() };
        return data;
    })();

    try {
        return await inflight;
    } finally {
        inflight = null;
    }
}

// Parses nbsense "last_seen" like "20-May-26 14:00" into an ISO timestamp.
export function nbsenseLastSeenToIso(lastSeen: string): string {
    const m = lastSeen.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!m) return new Date().toISOString();
    const [, dd, mon, yy, hh, mi] = m;
    const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const year = 2000 + parseInt(yy, 10);
    const d = new Date(year, months[mon] ?? 0, parseInt(dd, 10), parseInt(hh, 10), parseInt(mi, 10));
    return d.toISOString();
}
