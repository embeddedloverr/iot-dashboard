import { NextResponse } from "next/server";
import { fetchNbsenseLatest, nbsenseLastSeenToIso } from "@/lib/nbsense";

export async function GET() {
    try {
        const data = await fetchNbsenseLatest();
        return NextResponse.json({
            success: true,
            data: {
                temp_c: data.temperature,
                hum_rh: data.humidity,
                ts: nbsenseLastSeenToIso(data.last_seen),
                last_seen: data.last_seen,
                location: data.location,
                sensor_name: data.sensor_name,
                status: data.status,
                daily: {
                    avgTemp: data.daily_avg_temp,
                    maxTemp: data.daily_max_temp,
                    maxTempTime: data.daily_max_temp_time,
                    minTemp: data.daily_min_temp,
                    minTempTime: data.daily_min_temp_time,
                    avgHum: data.daily_avg_humidity,
                    maxHum: data.daily_max_humidity,
                    maxHumTime: data.daily_max_humidity_time,
                    minHum: data.daily_min_humidity,
                    minHumTime: data.daily_min_humidity_time,
                },
                monthly: {
                    avgTemp: data.monthly_avg_temp,
                    maxTemp: data.monthly_max_temp,
                    maxTempDate: data.monthly_max_temp_date,
                    minTemp: data.monthly_min_temp,
                    minTempDate: data.monthly_min_temp_date,
                    avgHum: data.monthly_avg_humidity,
                    maxHum: data.monthly_max_humidity,
                    maxHumDate: data.monthly_max_humidity_date,
                    minHum: data.monthly_min_humidity,
                    minHumDate: data.monthly_min_humidity_date,
                },
            },
        });
    } catch (error) {
        console.error("[nbsense] fetch failed:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch nbsense data" },
            { status: 502 }
        );
    }
}
