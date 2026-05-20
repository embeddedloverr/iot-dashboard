import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { mqttPublish, buildRelayTopic, buildRelayPayload } from "@/lib/mqttClient";

// POST: Manually control an HVAC relay (pump, heater, or ac)
// Body: { configId: string, relay: "pump" | "heater" | "ac", action: "ON" | "OFF" }
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { configId, relay, action } = body;

        if (!configId || typeof configId !== "string") {
            return NextResponse.json({ success: false, error: "configId is required" }, { status: 400 });
        }
        if (!["pump", "heater", "ac"].includes(relay)) {
            return NextResponse.json({ success: false, error: "relay must be 'pump', 'heater', or 'ac'" }, { status: 400 });
        }
        if (!["ON", "OFF"].includes(action)) {
            return NextResponse.json({ success: false, error: "action must be 'ON' or 'OFF'" }, { status: 400 });
        }

        const db = await getDb();
        const config = await db.collection("hvac_configs").findOne({ _id: new ObjectId(configId) });

        if (!config) {
            return NextResponse.json({ success: false, error: "HVAC zone not found" }, { status: 404 });
        }

        const relayConfig = config[relay as "pump" | "heater" | "ac"];
        if (!relayConfig?.relayMac) {
            return NextResponse.json({ success: false, error: `No ${relay} relay MAC configured` }, { status: 400 });
        }

        // Build and publish MQTT command
        const topic = buildRelayTopic(relayConfig.relayMac);
        const payload = buildRelayPayload(relayConfig.relayChannel || 1, action as "ON" | "OFF");
        const result = await mqttPublish(topic, payload);

        const now = new Date();
        const relayLabel = relay === "pump" ? "Pump" : relay === "heater" ? "Heater" : "AC";

        if (result.success) {
            // Update the specific relay state
            await db.collection("hvac_configs").updateOne(
                { _id: new ObjectId(configId) },
                {
                    $set: {
                        [`${relay}.manualState`]: action,
                        [`${relay}.lastAction`]: action,
                        [`${relay}.lastExecutedAt`]: now,
                        updatedAt: now,
                    },
                }
            );

            // Audit log
            await db.collection("relay_log").insertOne({
                ruleId: configId,
                ruleName: `HVAC ${relayLabel}: ${config.zoneName}`,
                relayMac: relayConfig.relayMac,
                mqttTopic: topic,
                mqttPayload: payload,
                sensorMac: config.sensorMac,
                sensorData: null,
                matchedCondition: `Manual ${relayLabel} control → ${action}`,
                action,
                channel: relayConfig.relayChannel || 1,
                success: true,
                error: null,
                executedAt: now,
                source: `hvac_manual_${relay}`,
            });

            return NextResponse.json({
                success: true,
                message: `HVAC ${relayLabel} ${action} command sent`,
                relay,
                action,
                topic,
                payload,
            });
        } else {
            return NextResponse.json(
                { success: false, error: `MQTT publish failed: ${result.error}` },
                { status: 502 }
            );
        }
    } catch (error) {
        console.error("Error controlling HVAC relay:", error);
        return NextResponse.json({ success: false, error: "Failed to control HVAC relay" }, { status: 500 });
    }
}
