import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateSingleReading, isPhysicallyValid } from "@/lib/sensorFilter";

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
                    mongoTs: { $toDate: "$latestDoc._id" },
                },
            },
        ];

        const results = await collection.aggregate(pipeline).toArray();

        // Validate each device's latest reading against its recent history
        const validatedResults = [];
        for (const reading of results) {
            const mac = reading.mac;
            const temp = reading.temp_c;
            const hum = reading.hum_rh;

            // Fetch recent readings for this device to build IQR baseline
            const recentDocs = await collection
                .aggregate([
                    { $match: { topic: "smartdwell/sensor/temp", "json.mac": mac } },
                    { $sort: { _id: -1 } },
                    { $skip: 1 }, // Skip the latest (which we're validating)
                    { $limit: 20 },
                    { $project: { _id: 0, temp_c: "$json.temp_c", hum_rh: "$json.hum_rh" } },
                ])
                .toArray();

            // Only keep physically valid readings for the baseline
            const validRecent = recentDocs.filter((d) =>
                isPhysicallyValid(d.temp_c as number, d.hum_rh as number)
            );

            const recentTemps = validRecent
                .map((d) => d.temp_c as number)
                .filter((v) => typeof v === "number" && !isNaN(v));
            const recentHums = validRecent
                .map((d) => d.hum_rh as number)
                .filter((v) => typeof v === "number" && !isNaN(v));

            const validation = validateSingleReading(temp, hum, recentTemps, recentHums);

            if (validation.valid) {
                validatedResults.push(reading);
            } else {
                // Latest reading is a spike — fall back to most recent valid reading
                console.log(`[SensorFilter] ${mac}: Spike detected in latest reading — ${validation.reason}`);

                // Find the most recent valid reading from history
                const fallback = validRecent.length > 0 ? validRecent[0] : null;
                if (fallback) {
                    // Use the fallback values but keep the original metadata
                    validatedResults.push({
                        ...reading,
                        temp_c: fallback.temp_c,
                        hum_rh: fallback.hum_rh,
                        _spikeFiltered: true,
                        _originalTemp: temp,
                        _originalHum: hum,
                        _filterReason: validation.reason,
                    });
                } else {
                    // No valid fallback available, include as-is
                    validatedResults.push(reading);
                }
            }
        }

        return NextResponse.json({ success: true, data: validatedResults });
    } catch (error) {
        console.error("Error fetching latest sensor data:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch sensor data" },
            { status: 500 }
        );
    }
}

