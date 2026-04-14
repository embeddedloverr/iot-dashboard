import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// POST: Receive temperature data from devices
// Body: { "node_id": 1, "mac": "3C:71:BF:44:A1:22", "temp": 34.5, "humidity": 72.3 }
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { node_id, mac, temp, humidity } = body;

        // Validate required fields
        if (node_id === undefined || node_id === null) {
            return NextResponse.json(
                { success: false, error: "node_id is required" },
                { status: 400 }
            );
        }
        if (!mac || typeof mac !== "string") {
            return NextResponse.json(
                { success: false, error: "mac address is required and must be a string" },
                { status: 400 }
            );
        }
        if (typeof temp !== "number") {
            return NextResponse.json(
                { success: false, error: "temp is required and must be a number" },
                { status: 400 }
            );
        }
        if (typeof humidity !== "number") {
            return NextResponse.json(
                { success: false, error: "humidity is required and must be a number" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const timestamp = new Date();

        // Store in mqtt_packets collection to stay consistent with existing data pipeline
        const doc = {
            topic: "smartdwell/sensor/temp",
            json: {
                node_id,
                mac: mac.toUpperCase(),
                temp_c: temp,
                hum_rh: humidity,
                ts: timestamp.toISOString(),
            },
            receivedAt: timestamp,
        };

        await db.collection("mqtt_packets").insertOne(doc);

        return NextResponse.json({
            success: true,
            message: "Temperature data stored successfully",
            data: {
                node_id,
                mac: mac.toUpperCase(),
                temp,
                humidity,
                timestamp: timestamp.toISOString(),
            },
        });
    } catch (error) {
        console.error("Error storing temperature data:", error);
        return NextResponse.json(
            { success: false, error: "Failed to store temperature data" },
            { status: 500 }
        );
    }
}

// GET: Retrieve latest temperature readings for all devices
export async function GET() {
    try {
        const db = await getDb();

        const pipeline = [
            { $match: { topic: "smartdwell/sensor/temp" } },
            { $sort: { _id: -1 as const } },
            {
                $group: {
                    _id: "$json.mac",
                    latestDoc: { $first: "$$ROOT" },
                },
            },
            {
                $project: {
                    _id: 0,
                    node_id: "$latestDoc.json.node_id",
                    mac: "$_id",
                    temp: "$latestDoc.json.temp_c",
                    humidity: "$latestDoc.json.hum_rh",
                    timestamp: "$latestDoc.json.ts",
                    receivedAt: "$latestDoc.receivedAt",
                },
            },
            { $sort: { node_id: 1 as const } },
        ];

        const results = await db.collection("mqtt_packets").aggregate(pipeline).toArray();

        return NextResponse.json({ success: true, data: results });
    } catch (error) {
        console.error("Error fetching temperature data:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch temperature data" },
            { status: 500 }
        );
    }
}
