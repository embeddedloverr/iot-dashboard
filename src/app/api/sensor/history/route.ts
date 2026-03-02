import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function getTimeRangeMs(range: string): number {
    switch (range) {
        case "1h":
            return 60 * 60 * 1000;
        case "6h":
            return 6 * 60 * 60 * 1000;
        case "24h":
            return 24 * 60 * 60 * 1000;
        case "7d":
            return 7 * 24 * 60 * 60 * 1000;
        case "30d":
            return 30 * 24 * 60 * 60 * 1000;
        default:
            return 24 * 60 * 60 * 1000;
    }
}

function parseSensorTimestamp(ts: string): Date | null {
    // Format: "DD-MM-YYYY HH:mm:ss"
    if (!ts) return null;
    const parts = ts.match(/(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2}):(\d{2})/);
    if (!parts) return null;
    const [, day, month, year, hour, min, sec] = parts;
    return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(min),
        Number(sec)
    );
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const mac = searchParams.get("mac");
        const range = searchParams.get("range") || "24h";

        const db = await getDb();
        const collection = db.collection("mqtt_packets");

        const rangeMs = getTimeRangeMs(range);
        const cutoffDate = new Date(Date.now() - rangeMs);

        // Build match filter
        const matchFilter: Record<string, unknown> = {
            topic: "smartdwell/sensor/temp",
        };
        if (mac) {
            matchFilter["json.mac"] = mac;
        }

        // Determine sample size based on range to avoid too many points
        const maxPoints = 200;

        // Fetch recent docs and then filter/downsample on the server
        const pipeline = [
            { $match: matchFilter },
            { $sort: { _id: -1 as const } },
            { $limit: 10000 },
            {
                $project: {
                    _id: 0,
                    temp_c: "$json.temp_c",
                    hum_rh: "$json.hum_rh",
                    mac: "$json.mac",
                    ts: "$json.ts",
                    rssi: "$json.rssi",
                },
            },
        ];

        let results = await collection.aggregate(pipeline).toArray();

        // Filter by timestamp cutoff (since ts is a string, we parse it)
        results = results.filter((doc) => {
            const docDate = parseSensorTimestamp(doc.ts);
            return docDate && docDate >= cutoffDate;
        });

        // Downsample if too many points
        if (results.length > maxPoints) {
            const step = Math.ceil(results.length / maxPoints);
            results = results.filter((_, i) => i % step === 0);
        }

        // Reverse so oldest first for charts
        results.reverse();

        return NextResponse.json({ success: true, data: results, count: results.length });
    } catch (error) {
        console.error("Error fetching history:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch history" },
            { status: 500 }
        );
    }
}
