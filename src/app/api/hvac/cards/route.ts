import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { validateSingleReading, isPhysicallyValid } from "@/lib/sensorFilter";

// GET: List pinned sensor cards with enriched + spike-filtered live data
export async function GET() {
    try {
        const db = await getDb();
        const cards = await db.collection("hvac_sensor_cards").find({}).sort({ createdAt: 1 }).toArray();

        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) aliasMap[a.mac] = a.alias;

        const macs = [...new Set(cards.map((c) => c.sensorMac).filter(Boolean))];
        const sensorMap: Record<string, { temp_c: number; hum_rh: number; ts: string; rssi?: number }> = {};
        const collection = db.collection("mqtt_packets");

        // For each pinned sensor, get latest reading and validate against recent history
        for (const mac of macs) {
            // Get the latest reading
            const latestArr = await collection
                .aggregate([
                    { $match: { topic: "smartdwell/sensor/temp", "json.mac": mac } },
                    { $sort: { _id: -1 } },
                    { $limit: 1 },
                    { $project: { _id: 0, temp_c: "$json.temp_c", hum_rh: "$json.hum_rh", ts: "$json.ts", rssi: "$json.rssi" } },
                ])
                .toArray();

            if (latestArr.length === 0) continue;

            const latest = latestArr[0];
            const temp = latest.temp_c as number;
            const hum = latest.hum_rh as number;

            // Fetch recent history for IQR baseline (skip the latest)
            const recentDocs = await collection
                .aggregate([
                    { $match: { topic: "smartdwell/sensor/temp", "json.mac": mac } },
                    { $sort: { _id: -1 } },
                    { $skip: 1 },
                    { $limit: 20 },
                    { $project: { _id: 0, temp_c: "$json.temp_c", hum_rh: "$json.hum_rh", ts: "$json.ts", rssi: "$json.rssi" } },
                ])
                .toArray();

            const validRecent = recentDocs.filter((d) =>
                isPhysicallyValid(d.temp_c as number, d.hum_rh as number)
            );

            const recentTemps = validRecent.map((d) => d.temp_c as number).filter((v) => typeof v === "number" && !isNaN(v));
            const recentHums = validRecent.map((d) => d.hum_rh as number).filter((v) => typeof v === "number" && !isNaN(v));

            const validation = validateSingleReading(temp, hum, recentTemps, recentHums);

            if (validation.valid) {
                sensorMap[mac] = { temp_c: temp, hum_rh: hum, ts: (latest.ts as string) || "", rssi: latest.rssi as number };
            } else {
                // Spike detected — fall back to most recent valid reading
                console.log(`[HvacCards] ${mac}: Spike filtered — ${validation.reason}`);
                const fallback = validRecent.length > 0 ? validRecent[0] : null;
                if (fallback) {
                    sensorMap[mac] = { temp_c: fallback.temp_c as number, hum_rh: fallback.hum_rh as number, ts: (fallback.ts as string) || "", rssi: fallback.rssi as number };
                } else {
                    // No valid fallback, use as-is
                    sensorMap[mac] = { temp_c: temp, hum_rh: hum, ts: (latest.ts as string) || "", rssi: latest.rssi as number };
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
