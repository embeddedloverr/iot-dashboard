import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

// Relay rule condition interface
interface RelayCondition {
    id: string;
    priority: number;
    field: "temp_c" | "hum_rh";
    operator: ">" | "<" | ">=" | "<=" | "==";
    value: number;
    action: "ON" | "OFF";
    relayChannel: number;
}

interface RelayRule {
    relayName: string;
    relayMac?: string;
    relayEndpoint: string;
    enabled: boolean;
    sensorMac: string;
    conditions: RelayCondition[];
    defaultAction: "ON" | "OFF";
    defaultChannel: number;
    cooldownSeconds: number;
}

// GET: List all relay rules
export async function GET() {
    try {
        const db = await getDb();
        const rules = await db
            .collection("relay_rules")
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        // Fetch sensor aliases for display
        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) {
            aliasMap[a.mac] = a.alias;
        }

        // Attach alias names to rules
        const enriched = rules.map((rule) => ({
            ...rule,
            _id: rule._id.toString(),
            sensorAlias: aliasMap[rule.sensorMac] || rule.sensorMac,
        }));

        return NextResponse.json({ success: true, data: enriched });
    } catch (error) {
        console.error("Error fetching relay rules:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch relay rules" },
            { status: 500 }
        );
    }
}

// POST: Create or update a relay rule
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            _id,
            relayName,
            relayMac,
            relayEndpoint,
            enabled,
            sensorMac,
            conditions,
            defaultAction,
            defaultChannel,
            cooldownSeconds,
        } = body as RelayRule & { _id?: string };

        // Validate required fields
        if (!relayName || typeof relayName !== "string") {
            return NextResponse.json(
                { success: false, error: "relayName is required" },
                { status: 400 }
            );
        }
        if (!relayEndpoint || typeof relayEndpoint !== "string") {
            return NextResponse.json(
                { success: false, error: "relayEndpoint URL is required" },
                { status: 400 }
            );
        }
        if (!sensorMac || typeof sensorMac !== "string") {
            return NextResponse.json(
                { success: false, error: "sensorMac is required" },
                { status: 400 }
            );
        }
        if (!Array.isArray(conditions) || conditions.length === 0) {
            return NextResponse.json(
                { success: false, error: "At least one condition is required" },
                { status: 400 }
            );
        }

        // Validate each condition
        for (const cond of conditions) {
            if (!["temp_c", "hum_rh"].includes(cond.field)) {
                return NextResponse.json(
                    { success: false, error: `Invalid field: ${cond.field}` },
                    { status: 400 }
                );
            }
            if (![">", "<", ">=", "<=", "=="].includes(cond.operator)) {
                return NextResponse.json(
                    { success: false, error: `Invalid operator: ${cond.operator}` },
                    { status: 400 }
                );
            }
            if (typeof cond.value !== "number") {
                return NextResponse.json(
                    { success: false, error: "Condition value must be a number" },
                    { status: 400 }
                );
            }
            if (!["ON", "OFF"].includes(cond.action)) {
                return NextResponse.json(
                    { success: false, error: `Invalid action: ${cond.action}` },
                    { status: 400 }
                );
            }
        }

        const db = await getDb();
        const now = new Date();

        const doc = {
            relayName,
            relayMac: relayMac || "",
            relayEndpoint,
            enabled: enabled !== false,
            sensorMac,
            conditions: conditions.map((c: RelayCondition, i: number) => ({
                ...c,
                priority: i + 1,
                id: c.id || `cond_${Date.now()}_${i}`,
            })),
            defaultAction: defaultAction || "OFF",
            defaultChannel: defaultChannel || 1,
            cooldownSeconds: cooldownSeconds || 60,
            updatedAt: now,
        };

        if (_id) {
            // Update existing rule
            await db.collection("relay_rules").updateOne(
                { _id: new ObjectId(_id) },
                { $set: doc }
            );
            return NextResponse.json({
                success: true,
                message: "Relay rule updated",
                id: _id,
            });
        } else {
            // Create new rule
            const result = await db.collection("relay_rules").insertOne({
                ...doc,
                lastExecutedAt: null,
                lastAction: null,
                createdAt: now,
            });
            return NextResponse.json({
                success: true,
                message: "Relay rule created",
                id: result.insertedId.toString(),
            });
        }
    } catch (error) {
        console.error("Error saving relay rule:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save relay rule" },
            { status: 500 }
        );
    }
}

// DELETE: Remove a relay rule by ID
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Rule ID is required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const result = await db
            .collection("relay_rules")
            .deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { success: false, error: "Rule not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true, message: "Relay rule deleted" });
    } catch (error) {
        console.error("Error deleting relay rule:", error);
        return NextResponse.json(
            { success: false, error: "Failed to delete relay rule" },
            { status: 500 }
        );
    }
}
