import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { filterReadings } from "@/lib/sensorFilter";

// GET: Get stats (min, max, avg) for a specific time range
// Applies IQR-based outlier filtering to exclude spikes before computing statistics
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const mac = searchParams.get("mac");
        const range = searchParams.get("range") || "24h";

        const db = await getDb();
        const collection = db.collection("mqtt_packets");

        const rangeMs: Record<string, number> = {
            "1h": 3600000,
            "6h": 21600000,
            "24h": 86400000,
            "7d": 604800000,
            "30d": 2592000000,
        };

        const ms = rangeMs[range] || rangeMs["24h"];
        const limit = Math.min(Math.ceil(ms / 10000), 50000); // rough estimate

        const matchFilter: Record<string, unknown> = {
            topic: "smartdwell/sensor/temp",
        };
        if (mac) matchFilter["json.mac"] = mac;

        // Fetch raw readings instead of computing stats in Mongo,
        // so we can filter outliers before computing stats
        const rawPipeline = [
            { $match: matchFilter },
            { $sort: { _id: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    temp_c: "$json.temp_c",
                    hum_rh: "$json.hum_rh",
                },
            },
        ];

        const rawReadings = await collection.aggregate(rawPipeline).toArray();

        // Apply IQR-based outlier filtering (physical bounds + statistical IQR)
        const filtered = filterReadings(rawReadings, "temp_c", "hum_rh");

        // Compute stats from filtered data
        const temps = filtered
            .map((r) => r.temp_c as number)
            .filter((v) => typeof v === "number" && !isNaN(v));
        const hums = filtered
            .map((r) => r.hum_rh as number)
            .filter((v) => typeof v === "number" && !isNaN(v));

        const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
        const minTemp = temps.length > 0 ? Math.min(...temps) : 0;
        const maxTemp = temps.length > 0 ? Math.max(...temps) : 0;
        const avgHum = hums.length > 0 ? hums.reduce((a, b) => a + b, 0) / hums.length : 0;
        const minHum = hums.length > 0 ? Math.min(...hums) : 0;
        const maxHum = hums.length > 0 ? Math.max(...hums) : 0;

        return NextResponse.json({
            success: true,
            data: {
                temperature: {
                    avg: Math.round(avgTemp * 100) / 100,
                    min: Math.round(minTemp * 100) / 100,
                    max: Math.round(maxTemp * 100) / 100,
                },
                humidity: {
                    avg: Math.round(avgHum * 100) / 100,
                    min: Math.round(minHum * 100) / 100,
                    max: Math.round(maxHum * 100) / 100,
                },
                totalReadings: filtered.length,
                rawReadings: rawReadings.length,
                filteredOut: rawReadings.length - filtered.length,
            },
        });
    } catch (error) {
        console.error("Error fetching stats:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch stats" },
            { status: 500 }
        );
    }
}
