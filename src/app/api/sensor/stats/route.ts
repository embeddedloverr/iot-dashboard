import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Get stats (min, max, avg) for a specific time range
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

        const pipeline = [
            { $match: matchFilter },
            { $sort: { _id: -1 } },
            { $limit: limit },
            {
                $group: {
                    _id: null,
                    avgTemp: { $avg: "$json.temp_c" },
                    minTemp: { $min: "$json.temp_c" },
                    maxTemp: { $max: "$json.temp_c" },
                    avgHum: { $avg: "$json.hum_rh" },
                    minHum: { $min: "$json.hum_rh" },
                    maxHum: { $max: "$json.hum_rh" },
                    count: { $sum: 1 },
                },
            },
        ];

        const results = await collection.aggregate(pipeline).toArray();
        const stats = results[0] || {
            avgTemp: 0,
            minTemp: 0,
            maxTemp: 0,
            avgHum: 0,
            minHum: 0,
            maxHum: 0,
            count: 0,
        };

        return NextResponse.json({
            success: true,
            data: {
                temperature: {
                    avg: Math.round(stats.avgTemp * 100) / 100,
                    min: stats.minTemp,
                    max: stats.maxTemp,
                },
                humidity: {
                    avg: Math.round(stats.avgHum * 100) / 100,
                    min: stats.minHum,
                    max: stats.maxHum,
                },
                totalReadings: stats.count,
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
