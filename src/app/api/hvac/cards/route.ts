import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

// GET: List pinned sensor cards with enriched live data
export async function GET() {
    try {
        const db = await getDb();
        const cards = await db.collection("hvac_sensor_cards").find({}).sort({ createdAt: 1 }).toArray();

        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) aliasMap[a.mac] = a.alias;

        const macs = [...new Set(cards.map((c) => c.sensorMac).filter(Boolean))];
        const sensorMap: Record<string, { temp_c: number; hum_rh: number; ts: string; rssi?: number }> = {};

        if (macs.length > 0) {
            const latest = await db
                .collection("mqtt_packets")
                .aggregate([
                    { $match: { topic: "smartdwell/sensor/temp", "json.mac": { $in: macs } } },
                    { $sort: { _id: -1 } },
                    { $group: { _id: "$json.mac", latestDoc: { $first: "$$ROOT" } } },
                ])
                .toArray();
            for (const r of latest) {
                const j = r.latestDoc?.json;
                if (j?.mac) {
                    sensorMap[j.mac] = { temp_c: j.temp_c, hum_rh: j.hum_rh, ts: j.ts || "", rssi: j.rssi };
                }
            }
        }

        const enriched = cards.map((c) => ({
            _id: c._id.toString(),
            sensorMac: c.sensorMac,
            label: c.label || aliasMap[c.sensorMac] || c.sensorMac,
            createdAt: c.createdAt,
            sensorAlias: aliasMap[c.sensorMac] || c.sensorMac,
            sensorData: sensorMap[c.sensorMac] || null,
        }));

        return NextResponse.json({ success: true, data: enriched });
    } catch (error) {
        console.error("Error fetching HVAC sensor cards:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch sensor cards" }, { status: 500 });
    }
}

// POST: Add a sensor card. Body: { sensorMac: string, label?: string }
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const sensorMac = (body.sensorMac || "").toString().trim().toUpperCase();
        const label = (body.label || "").toString().trim();
        if (!sensorMac) {
            return NextResponse.json({ success: false, error: "sensorMac is required" }, { status: 400 });
        }

        const db = await getDb();
        const existing = await db.collection("hvac_sensor_cards").findOne({ sensorMac });
        if (existing) {
            return NextResponse.json({ success: false, error: "Sensor already pinned" }, { status: 409 });
        }

        const now = new Date();
        const result = await db.collection("hvac_sensor_cards").insertOne({ sensorMac, label, createdAt: now });
        return NextResponse.json({ success: true, id: result.insertedId.toString() });
    } catch (error) {
        console.error("Error adding sensor card:", error);
        return NextResponse.json({ success: false, error: "Failed to add sensor card" }, { status: 500 });
    }
}

// DELETE: ?id=<cardId>
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });

        const db = await getDb();
        const result = await db.collection("hvac_sensor_cards").deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return NextResponse.json({ success: false, error: "Card not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting sensor card:", error);
        return NextResponse.json({ success: false, error: "Failed to delete sensor card" }, { status: 500 });
    }
}
