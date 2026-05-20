import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

// HVAC Zone Configuration interfaces
interface HvacConfig {
    zoneName: string;
    relayMac: string;
    relayChannel: number;
    sensorMac: string;
    mode: "manual" | "auto";
    tempSetpoint: number;
    tempDeadband: number;
    humSetpoint: number;
    humDeadband: number;
    controlField: "temp" | "hum" | "both";
    manualState: "ON" | "OFF";
    cooldownSeconds: number;
    enabled: boolean;
}

// GET: List all HVAC zone configs enriched with live sensor data
export async function GET() {
    try {
        const db = await getDb();
        const configs = await db
            .collection("hvac_configs")
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        // Fetch sensor aliases for display
        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) {
            aliasMap[a.mac] = a.alias;
        }

        // Fetch latest sensor readings for all linked sensors
        const sensorMacs = [...new Set(configs.map((c) => c.sensorMac).filter(Boolean))];
        const sensorMap: Record<string, { temp_c: number; hum_rh: number; ts: string; rssi?: number }> = {};

        if (sensorMacs.length > 0) {
            const latestReadings = await db
                .collection("mqtt_packets")
                .aggregate([
                    { $match: { topic: "smartdwell/sensor/temp", "json.mac": { $in: sensorMacs } } },
                    { $sort: { _id: -1 } },
                    {
                        $group: {
                            _id: "$json.mac",
                            latestDoc: { $first: "$$ROOT" },
                        },
                    },
                ])
                .toArray();

            for (const reading of latestReadings) {
                const json = reading.latestDoc?.json;
                if (json?.mac) {
                    sensorMap[json.mac] = {
                        temp_c: json.temp_c,
                        hum_rh: json.hum_rh,
                        ts: json.ts || reading.latestDoc?.receivedAt?.toISOString() || "",
                        rssi: json.rssi,
                    };
                }
            }
        }

        // Enrich configs with sensor data and aliases
        const enriched = configs.map((config) => ({
            ...config,
            _id: config._id.toString(),
            sensorAlias: aliasMap[config.sensorMac] || config.sensorMac,
            relayAlias: aliasMap[config.relayMac] || config.relayMac,
            sensorData: sensorMap[config.sensorMac] || null,
        }));

        return NextResponse.json({ success: true, data: enriched });
    } catch (error) {
        console.error("Error fetching HVAC configs:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch HVAC configs" },
            { status: 500 }
        );
    }
}

// POST: Create or update an HVAC zone config
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            _id,
            zoneName,
            relayMac,
            relayChannel,
            sensorMac,
            mode,
            tempSetpoint,
            tempDeadband,
            humSetpoint,
            humDeadband,
            controlField,
            manualState,
            cooldownSeconds,
            enabled,
        } = body as HvacConfig & { _id?: string };

        // Validate required fields
        if (!zoneName || typeof zoneName !== "string") {
            return NextResponse.json(
                { success: false, error: "zoneName is required" },
                { status: 400 }
            );
        }
        if (!relayMac || typeof relayMac !== "string") {
            return NextResponse.json(
                { success: false, error: "relayMac is required" },
                { status: 400 }
            );
        }
        if (!sensorMac || typeof sensorMac !== "string") {
            return NextResponse.json(
                { success: false, error: "sensorMac is required" },
                { status: 400 }
            );
        }
        if (!["manual", "auto"].includes(mode)) {
            return NextResponse.json(
                { success: false, error: "mode must be 'manual' or 'auto'" },
                { status: 400 }
            );
        }
        if (mode === "auto") {
            if (typeof tempSetpoint !== "number" || typeof humSetpoint !== "number") {
                return NextResponse.json(
                    { success: false, error: "Setpoints are required in auto mode" },
                    { status: 400 }
                );
            }
        }

        const db = await getDb();
        const now = new Date();

        const doc = {
            zoneName: zoneName.trim(),
            relayMac: relayMac.trim().toUpperCase(),
            relayChannel: relayChannel || 1,
            sensorMac: sensorMac.trim(),
            mode: mode || "manual",
            tempSetpoint: tempSetpoint ?? 24,
            tempDeadband: tempDeadband ?? 1.0,
            humSetpoint: humSetpoint ?? 55,
            humDeadband: humDeadband ?? 5.0,
            controlField: controlField || "temp",
            manualState: manualState || "OFF",
            cooldownSeconds: cooldownSeconds || 60,
            enabled: enabled !== false,
            updatedAt: now,
        };

        if (_id) {
            // Update existing config
            await db.collection("hvac_configs").updateOne(
                { _id: new ObjectId(_id) },
                { $set: doc }
            );
            return NextResponse.json({
                success: true,
                message: "HVAC zone updated",
                id: _id,
            });
        } else {
            // Create new config
            const result = await db.collection("hvac_configs").insertOne({
                ...doc,
                lastAction: null,
                lastExecutedAt: null,
                createdAt: now,
            });
            return NextResponse.json({
                success: true,
                message: "HVAC zone created",
                id: result.insertedId.toString(),
            });
        }
    } catch (error) {
        console.error("Error saving HVAC config:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save HVAC config" },
            { status: 500 }
        );
    }
}

// DELETE: Remove an HVAC zone config by ID
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Zone ID is required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const result = await db
            .collection("hvac_configs")
            .deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { success: false, error: "Zone not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, message: "HVAC zone deleted" });
    } catch (error) {
        console.error("Error deleting HVAC config:", error);
        return NextResponse.json(
            { success: false, error: "Failed to delete HVAC zone" },
            { status: 500 }
        );
    }
}
