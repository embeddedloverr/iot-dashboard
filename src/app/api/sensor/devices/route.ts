import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Retrieve list of unique devices (MAC addresses)
export async function GET() {
    try {
        const db = await getDb();
        const collection = db.collection("mqtt_packets");

        const devices = await collection
            .aggregate([
                { $match: { topic: "smartdwell/sensor/temp" } },
                {
                    $group: {
                        _id: "$json.mac",
                        ssid: { $last: "$json.ssid" },
                        lastSeen: { $last: "$json.ts" },
                        count: { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        mac: "$_id",
                        ssid: 1,
                        lastSeen: 1,
                        count: 1,
                    },
                },
                { $sort: { count: -1 } },
            ])
            .toArray();

        return NextResponse.json({ success: true, data: devices });
    } catch (error) {
        console.error("Error fetching devices:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch devices" },
            { status: 500 }
        );
    }
}
