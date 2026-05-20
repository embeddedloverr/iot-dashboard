import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { mqttPublish, buildRelayTopic, buildRelayPayload } from "@/lib/mqttClient";

// POST: Manually control an HVAC relay
// Body: { configId: string, action: "ON" | "OFF" }
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { configId, action } = body;

        if (!configId || typeof configId !== "string") {
            return NextResponse.json(
                { success: false, error: "configId is required" },
                { status: 400 }
            );
        }
        if (!["ON", "OFF"].includes(action)) {
            return NextResponse.json(
                { success: false, error: "action must be 'ON' or 'OFF'" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const config = await db
            .collection("hvac_configs")
            .findOne({ _id: new ObjectId(configId) });

        if (!config) {
            return NextResponse.json(
                { success: false, error: "HVAC zone not found" },
                { status: 404 }
            );
        }

        if (!config.relayMac) {
            return NextResponse.json(
                { success: false, error: "No relay MAC configured for this zone" },
                { status: 400 }
            );
        }

        // Build and publish MQTT command
        const topic = buildRelayTopic(config.relayMac);
        const payload = buildRelayPayload(config.relayChannel || 1, action as "ON" | "OFF");
        const result = await mqttPublish(topic, payload);

        const now = new Date();

        if (result.success) {
            // Update HVAC config with new state
            await db.collection("hvac_configs").updateOne(
                { _id: new ObjectId(configId) },
                {
                    $set: {
                        manualState: action,
                        lastAction: action,
                        lastExecutedAt: now,
                        updatedAt: now,
                    },
                }
            );

            // Audit log
            await db.collection("relay_log").insertOne({
                ruleId: configId,
                ruleName: `HVAC: ${config.zoneName}`,
                relayMac: config.relayMac,
                mqttTopic: topic,
                mqttPayload: payload,
                sensorMac: config.sensorMac,
                sensorData: null,
                matchedCondition: `Manual control → ${action}`,
                action,
                channel: config.relayChannel || 1,
                success: true,
                error: null,
                executedAt: now,
                source: "hvac_manual",
            });

            return NextResponse.json({
                success: true,
                message: `HVAC relay ${action} command sent`,
                action,
                topic,
                payload,
            });
        } else {
            return NextResponse.json(
                {
                    success: false,
                    error: `MQTT publish failed: ${result.error}`,
                },
                { status: 502 }
            );
        }
    } catch (error) {
        console.error("Error controlling HVAC relay:", error);
        return NextResponse.json(
            { success: false, error: "Failed to control HVAC relay" },
            { status: 500 }
        );
    }
}
