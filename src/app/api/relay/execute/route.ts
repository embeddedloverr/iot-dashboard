import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isPhysicallyValid } from "@/lib/sensorFilter";

// Evaluate a single condition against sensor values
function evaluateCondition(
    condition: { field: string; operator: string; value: number },
    sensorData: { temp_c: number; hum_rh: number }
): boolean {
    const fieldValue =
        condition.field === "temp_c" ? sensorData.temp_c : sensorData.hum_rh;

    if (fieldValue === null || fieldValue === undefined) return false;

    switch (condition.operator) {
        case ">":
            return fieldValue > condition.value;
        case "<":
            return fieldValue < condition.value;
        case ">=":
            return fieldValue >= condition.value;
        case "<=":
            return fieldValue <= condition.value;
        case "==":
            return Math.abs(fieldValue - condition.value) < 0.1; // float tolerance
        default:
            return false;
    }
}

// Send command to relay device via HTTP
async function sendRelayCommand(
    endpoint: string,
    channel: number,
    action: string
): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel, action }),
            signal: controller.signal,
        });

        clearTimeout(timeout);
        const text = await res.text();

        return {
            success: res.ok,
            response: text.slice(0, 500), // cap response length
        };
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return { success: false, error: errMsg };
    }
}

// GET: Execute all enabled relay rules
// Called periodically (every 30s) from the dashboard client
export async function GET() {
    const debug: string[] = [];

    try {
        const db = await getDb();

        // Load all enabled relay rules
        const rules = await db
            .collection("relay_rules")
            .find({ enabled: true })
            .toArray();

        debug.push(`Found ${rules.length} enabled relay rule(s)`);

        if (rules.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No enabled relay rules",
                executed: 0,
                debug,
            });
        }

        // Fetch latest sensor readings (one query for all)
        const latestReadings = await db
            .collection("mqtt_packets")
            .aggregate([
                { $match: { topic: "smartdwell/sensor/temp" } },
                { $sort: { _id: -1 } },
                {
                    $group: {
                        _id: "$json.mac",
                        latestDoc: { $first: "$$ROOT" },
                    },
                },
            ])
            .toArray();

        // Build a map: mac → { temp_c, hum_rh }
        const sensorMap: Record<string, { temp_c: number; hum_rh: number }> = {};
        for (const reading of latestReadings) {
            const json = reading.latestDoc?.json;
            if (json?.mac) {
                sensorMap[json.mac] = {
                    temp_c: json.temp_c,
                    hum_rh: json.hum_rh,
                };
            }
        }

        debug.push(`Loaded ${Object.keys(sensorMap).length} sensor reading(s)`);

        let executedCount = 0;
        const results: Array<{
            rule: string;
            status: string;
            action?: string;
            channel?: number;
            matchedCondition?: string;
        }> = [];

        const now = Date.now();

        for (const rule of rules) {
            const ruleName = rule.relayName || rule._id.toString();
            const sensorData = sensorMap[rule.sensorMac];

            // Check if sensor has data
            if (!sensorData) {
                debug.push(`[${ruleName}] Sensor ${rule.sensorMac} — no data available, skipping`);
                results.push({ rule: ruleName, status: "no_sensor_data" });
                continue;
            }

            // Check physical validity of sensor data
            if (!isPhysicallyValid(sensorData.temp_c, sensorData.hum_rh)) {
                debug.push(`[${ruleName}] Sensor ${rule.sensorMac} — invalid data (temp=${sensorData.temp_c}, hum=${sensorData.hum_rh}), skipping`);
                results.push({ rule: ruleName, status: "invalid_sensor_data" });
                continue;
            }

            debug.push(`[${ruleName}] Sensor ${rule.sensorMac}: temp=${sensorData.temp_c}°C, hum=${sensorData.hum_rh}%`);

            // Check cooldown
            if (rule.lastExecutedAt) {
                const elapsed = (now - new Date(rule.lastExecutedAt).getTime()) / 1000;
                const cooldown = rule.cooldownSeconds || 60;
                if (elapsed < cooldown) {
                    debug.push(`[${ruleName}] Cooldown active: ${Math.ceil(cooldown - elapsed)}s remaining`);
                    results.push({ rule: ruleName, status: "cooldown" });
                    continue;
                }
            }

            // Evaluate conditions (first match wins)
            const conditions = (rule.conditions || []).sort(
                (a: { priority: number }, b: { priority: number }) => a.priority - b.priority
            );

            let matchedAction: string | null = null;
            let matchedChannel: number = rule.defaultChannel || 1;
            let matchedCondDesc = "";

            for (const cond of conditions) {
                if (evaluateCondition(cond, sensorData)) {
                    matchedAction = cond.action;
                    matchedChannel = cond.relayChannel || rule.defaultChannel || 1;
                    const fieldLabel = cond.field === "temp_c" ? "temp" : "humidity";
                    const sensorVal = cond.field === "temp_c" ? sensorData.temp_c : sensorData.hum_rh;
                    matchedCondDesc = `${fieldLabel} ${sensorVal} ${cond.operator} ${cond.value}`;
                    debug.push(`[${ruleName}] ✓ Condition matched: ${matchedCondDesc} → ${matchedAction}`);
                    break;
                }
            }

            // Use default action if no condition matched
            if (!matchedAction) {
                matchedAction = rule.defaultAction || "OFF";
                matchedChannel = rule.defaultChannel || 1;
                matchedCondDesc = "default (no condition matched)";
                debug.push(`[${ruleName}] No condition matched → default: ${matchedAction}`);
            }

            // Skip if action hasn't changed (avoid redundant commands)
            if (rule.lastAction === matchedAction) {
                debug.push(`[${ruleName}] Action unchanged (${matchedAction}), skipping relay command`);
                results.push({
                    rule: ruleName,
                    status: "unchanged",
                    action: matchedAction,
                    channel: matchedChannel,
                });
                continue;
            }

            // Send command to relay
            debug.push(`[${ruleName}] Sending: channel=${matchedChannel} action=${matchedAction} → ${rule.relayEndpoint}`);
            const cmdResult = await sendRelayCommand(
                rule.relayEndpoint,
                matchedChannel,
                matchedAction
            );

            if (cmdResult.success) {
                debug.push(`[${ruleName}] ✓ Relay command sent successfully`);
                results.push({
                    rule: ruleName,
                    status: "executed",
                    action: matchedAction,
                    channel: matchedChannel,
                    matchedCondition: matchedCondDesc,
                });
            } else {
                debug.push(`[${ruleName}] ✗ Relay command failed: ${cmdResult.error}`);
                results.push({
                    rule: ruleName,
                    status: "error",
                    action: matchedAction,
                    channel: matchedChannel,
                });
            }

            // Update rule with last executed info
            await db.collection("relay_rules").updateOne(
                { _id: rule._id },
                {
                    $set: {
                        lastExecutedAt: new Date(),
                        lastAction: matchedAction,
                    },
                }
            );

            // Log the action
            await db.collection("relay_log").insertOne({
                ruleId: rule._id.toString(),
                ruleName,
                relayEndpoint: rule.relayEndpoint,
                sensorMac: rule.sensorMac,
                sensorData: {
                    temp_c: sensorData.temp_c,
                    hum_rh: sensorData.hum_rh,
                },
                matchedCondition: matchedCondDesc,
                action: matchedAction,
                channel: matchedChannel,
                success: cmdResult.success,
                relayResponse: cmdResult.response || cmdResult.error,
                executedAt: new Date(),
            });

            executedCount++;
        }

        return NextResponse.json({
            success: true,
            executed: executedCount,
            total: rules.length,
            results,
            debug,
        });
    } catch (error) {
        console.error("Error executing relay rules:", error);
        const errMsg = error instanceof Error ? error.message : String(error);
        debug.push(`FATAL ERROR: ${errMsg}`);
        return NextResponse.json(
            { success: false, error: "Failed to execute relay rules", debug },
            { status: 500 }
        );
    }
}
