import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
    try {
        const db = await getDb();
        const collection = db.collection("mqtt_packets");

        // Get the latest reading for each unique MAC address
        const pipeline = [
            { $match: { topic: "smartdwell/sensor/temp" } },
            { $sort: { _id: -1 } },
            {
                $group: {
                    _id: "$json.mac",
                    latestDoc: { $first: "$$ROOT" },
                },
            },
            {
                $project: {
                    _id: 0,
                    mac: "$_id",
                    temp_c: "$latestDoc.json.temp_c",
                    hum_rh: "$latestDoc.json.hum_rh",
                    rssi: "$latestDoc.json.rssi",
                    ssid: "$latestDoc.json.ssid",
                    ts: "$latestDoc.json.ts",
                    topic: "$latestDoc.topic",
                },
            },
        ];

        const results = await collection.aggregate(pipeline).toArray();
        return NextResponse.json({ success: true, data: results });
    } catch (error) {
        console.error("Error fetching latest sensor data:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch sensor data" },
            { status: 500 }
        );
    }
}
