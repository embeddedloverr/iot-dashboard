import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { fetchNbsenseLatest, nbsenseLastSeenToIso, NBSENSE_VIRTUAL_MAC } from "@/lib/nbsense";

// HVAC Zone with Pump + Heater relays + AC setpoint (no relay)
interface HvacRelayConfig {
    relayMac: string;
    relayChannel: number;
    mode: "manual" | "auto";
    manualState: "ON" | "OFF";
    lastAction: "ON" | "OFF" | null;
    lastExecutedAt: string | null;
}

interface HvacConfig {
    zoneName: string;
    sensorMac: string;
    pump: HvacRelayConfig;      // Pump — humidity-driven
    heater: HvacRelayConfig;    // Heater — temp-driven (ON when cold)
    // AC setpoints (display only, no relay)
    acTempSetpoint: number;
    acTempDeadband: number;
    // Heater setpoints
    tempSetpoint: number;
    tempDeadband: number;
    // Humidity setpoints (pump)
    humSetpoint: number;
    humDeadband: number;
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

        // Fetch sensor aliases
        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) {
            aliasMap[a.mac] = a.alias;
        }

        // All HVAC zones now share a single nbsense reading
        let nbsenseReading: { temp_c: number; hum_rh: number; ts: string; location: string } | null = null;
        try {
            const nb = await fetchNbsenseLatest();
            nbsenseReading = {
                temp_c: nb.temperature,
                hum_rh: nb.humidity,
                ts: nbsenseLastSeenToIso(nb.last_seen),
                location: nb.location,
            };
            aliasMap[NBSENSE_VIRTUAL_MAC] = `nbsense · ${nb.location || nb.sensor_name}`;
        } catch (err) {
            console.error("[hvac/config] nbsense fetch failed:", err);
        }

        const defaultRelay = { relayMac: "", relayChannel: 1, mode: "manual" as const, manualState: "OFF" as const, lastAction: null, lastExecutedAt: null };

        const enriched = configs.map((config) => {
            // Backward compatibility: normalize old schemas
            const pump = config.pump || { ...defaultRelay, relayMac: config.relayMac || "", relayChannel: config.relayChannel || 1, mode: config.mode || "manual", manualState: config.manualState || "OFF", lastAction: config.lastAction || null, lastExecutedAt: config.lastExecutedAt || null };
            const heater = config.heater || { ...defaultRelay };

            return {
                ...config,
                _id: config._id.toString(),
                pump,
                heater,
                tempSetpoint: config.tempSetpoint ?? 24,
                tempDeadband: config.tempDeadband ?? 1.0,
                acTempSetpoint: config.acTempSetpoint ?? 26,
                acTempDeadband: config.acTempDeadband ?? 1.0,
                humSetpoint: config.humSetpoint ?? 55,
                humDeadband: config.humDeadband ?? 5.0,
                cooldownSeconds: config.cooldownSeconds ?? 60,
                enabled: config.enabled !== false,
                sensorAlias: aliasMap[config.sensorMac] || aliasMap[NBSENSE_VIRTUAL_MAC] || config.sensorMac,
                sensorData: nbsenseReading,
            };
        });

        return NextResponse.json({ success: true, data: enriched });
    } catch (error) {
        console.error("Error fetching HVAC configs:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch HVAC configs" }, { status: 500 });
    }
}

// POST: Create or update an HVAC zone config
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { _id, zoneName, sensorMac, pump, heater, tempSetpoint, tempDeadband, acTempSetpoint, acTempDeadband, humSetpoint, humDeadband, cooldownSeconds, enabled } = body as HvacConfig & { _id?: string };

        if (!zoneName || typeof zoneName !== "string") {
            return NextResponse.json({ success: false, error: "zoneName is required" }, { status: 400 });
        }
        const effectiveSensorMac = (sensorMac && typeof sensorMac === "string" && sensorMac.trim()) || NBSENSE_VIRTUAL_MAC;

        const buildRelay = (r: HvacRelayConfig | undefined) => ({
            relayMac: (r?.relayMac || "").trim().toUpperCase(),
            relayChannel: r?.relayChannel || 1,
            mode: r?.mode || "manual",
            manualState: r?.manualState || "OFF",
            lastAction: r?.lastAction ?? null,
            lastExecutedAt: r?.lastExecutedAt ?? null,
        });

        const db = await getDb();
        const now = new Date();

        const doc = {
            zoneName: zoneName.trim(),
            sensorMac: effectiveSensorMac,
            pump: buildRelay(pump),
            heater: buildRelay(heater),
            tempSetpoint: tempSetpoint ?? 24,
            tempDeadband: tempDeadband ?? 1.0,
            acTempSetpoint: acTempSetpoint ?? 26,
            acTempDeadband: acTempDeadband ?? 1.0,
            humSetpoint: humSetpoint ?? 55,
            humDeadband: humDeadband ?? 5.0,
            cooldownSeconds: cooldownSeconds || 60,
            enabled: enabled !== false,
            updatedAt: now,
        };

        if (_id) {
            await db.collection("hvac_configs").updateOne({ _id: new ObjectId(_id) }, { $set: doc });
            return NextResponse.json({ success: true, message: "HVAC zone updated", id: _id });
        } else {
            const result = await db.collection("hvac_configs").insertOne({ ...doc, createdAt: now });
            return NextResponse.json({ success: true, message: "HVAC zone created", id: result.insertedId.toString() });
        }
    } catch (error) {
        console.error("Error saving HVAC config:", error);
        return NextResponse.json({ success: false, error: "Failed to save HVAC config" }, { status: 500 });
    }
}

// DELETE: Remove an HVAC zone config by ID
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, error: "Zone ID is required" }, { status: 400 });

        const db = await getDb();
        const result = await db.collection("hvac_configs").deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return NextResponse.json({ success: false, error: "Zone not found" }, { status: 404 });

        return NextResponse.json({ success: true, message: "HVAC zone deleted" });
    } catch (error) {
        console.error("Error deleting HVAC config:", error);
        return NextResponse.json({ success: false, error: "Failed to delete HVAC zone" }, { status: 500 });
    }
}
