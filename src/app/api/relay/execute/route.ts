import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isPhysicallyValid } from "@/lib/sensorFilter";
import { mqttPublish, buildRelayTopic, buildRelayPayload } from "@/lib/mqttClient";

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
                    action: matchedAction ?? undefined,
                    channel: matchedChannel,
                });
                continue;
            }

            // Send command to relay via MQTT
            const relayMac = rule.relayMac;
            if (!relayMac) {
                debug.push(`[${ruleName}] ✗ No relay MAC configured, skipping`);
                results.push({ rule: ruleName, status: "no_relay_mac" });
                continue;
            }

            const topic = buildRelayTopic(relayMac);
            const payload = buildRelayPayload(matchedChannel, matchedAction as "ON" | "OFF");
            debug.push(`[${ruleName}] MQTT publish: ${topic} → ${JSON.stringify(payload)}`);

            const cmdResult = await mqttPublish(topic, payload);

            if (cmdResult.success) {
                debug.push(`[${ruleName}] ✓ MQTT publish successful`);
                results.push({
                    rule: ruleName,
                    status: "executed",
                    action: matchedAction ?? undefined,
                    channel: matchedChannel,
                    matchedCondition: matchedCondDesc,
                });
            } else {
                debug.push(`[${ruleName}] ✗ MQTT publish failed: ${cmdResult.error}`);
                results.push({
                    rule: ruleName,
                    status: "error",
                    action: matchedAction ?? undefined,
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
                relayMac,
                mqttTopic: topic,
                mqttPayload: payload,
                sensorMac: rule.sensorMac,
                sensorData: {
                    temp_c: sensorData.temp_c,
                    hum_rh: sensorData.hum_rh,
                },
                matchedCondition: matchedCondDesc,
                action: matchedAction,
                channel: matchedChannel,
                success: cmdResult.success,
                error: cmdResult.error || null,
                executedAt: new Date(),
            });

            executedCount++;
        }

        // ========== HVAC AUTO-MODE EVALUATION (Dual Relay: Pump + Heater) ==========
        debug.push(`\n--- HVAC Auto-Mode Evaluation ---`);

        const hvacConfigs = await db
            .collection("hvac_configs")
            .find({ enabled: true })
            .toArray();

        debug.push(`Found ${hvacConfigs.length} enabled HVAC config(s)`);

        for (const config of hvacConfigs) {
            const zoneName = config.zoneName || config._id.toString();
            const sData = sensorMap[config.sensorMac];

            if (!sData) {
                debug.push(`[HVAC: ${zoneName}] Sensor ${config.sensorMac} — no data, skipping`);
                continue;
            }

            if (!isPhysicallyValid(sData.temp_c, sData.hum_rh)) {
                debug.push(`[HVAC: ${zoneName}] Sensor data invalid, skipping`);
                continue;
            }

            debug.push(`[HVAC: ${zoneName}] Sensor: temp=${sData.temp_c}°C, hum=${sData.hum_rh}%`);

            // --- Evaluate HEATER (temperature-driven) ---
            const heater = config.heater;
            if (heater && heater.mode === "auto" && heater.relayMac) {
                debug.push(`[HVAC: ${zoneName}/Heater] Setpoint: ${config.tempSetpoint}±${config.tempDeadband}°C`);

                let heaterCooldownOk = true;
                if (heater.lastExecutedAt) {
                    const elapsed = (now - new Date(heater.lastExecutedAt).getTime()) / 1000;
                    const cd = config.cooldownSeconds || 60;
                    if (elapsed < cd) {
                        debug.push(`[HVAC: ${zoneName}/Heater] Cooldown: ${Math.ceil(cd - elapsed)}s remaining`);
                        heaterCooldownOk = false;
                    }
                }

                if (heaterCooldownOk) {
                    let heaterAction: "ON" | "OFF" | null = null;
                    const tUpper = config.tempSetpoint + (config.tempDeadband || 1);
                    const tLower = config.tempSetpoint - (config.tempDeadband || 1);

                    if (sData.temp_c < tLower) {
                        heaterAction = "ON"; // Below target, heat needed
                        debug.push(`[HVAC: ${zoneName}/Heater] Temp ${sData.temp_c}°C < ${tLower}°C → ON`);
                    } else if (sData.temp_c > tUpper) {
                        heaterAction = "OFF"; // Above target, stop heating
                        debug.push(`[HVAC: ${zoneName}/Heater] Temp ${sData.temp_c}°C > ${tUpper}°C → OFF`);
                    } else {
                        debug.push(`[HVAC: ${zoneName}/Heater] Within dead-band, no action`);
                    }

                    if (heaterAction && heater.lastAction !== heaterAction) {
                        const hTopic = buildRelayTopic(heater.relayMac);
                        const hPayload = buildRelayPayload(heater.relayChannel || 1, heaterAction);
                        const hResult = await mqttPublish(hTopic, hPayload);
                        debug.push(`[HVAC: ${zoneName}/Heater] MQTT: ${hTopic} → ${JSON.stringify(hPayload)} — ${hResult.success ? "✓" : "✗ " + hResult.error}`);

                        if (hResult.success) executedCount++;
                        await db.collection("hvac_configs").updateOne({ _id: config._id }, { $set: { "heater.lastAction": heaterAction, "heater.lastExecutedAt": new Date(), updatedAt: new Date() } });
                        await db.collection("relay_log").insertOne({ ruleId: config._id.toString(), ruleName: `HVAC Heater: ${zoneName}`, relayMac: heater.relayMac, mqttTopic: hTopic, mqttPayload: hPayload, sensorMac: config.sensorMac, sensorData: { temp_c: sData.temp_c, hum_rh: sData.hum_rh }, matchedCondition: `Heater auto → ${heaterAction}`, action: heaterAction, channel: heater.relayChannel || 1, success: hResult.success, error: hResult.error || null, executedAt: new Date(), source: "hvac_auto_heater" });
                    } else if (heaterAction) {
                        debug.push(`[HVAC: ${zoneName}/Heater] Action unchanged (${heaterAction}), skipping`);
                    }
                }
            }

            // --- Evaluate PUMP (humidity-driven) ---
            const pump = config.pump;
            if (pump && pump.mode === "auto" && pump.relayMac) {
                debug.push(`[HVAC: ${zoneName}/Pump] Setpoint: ${config.humSetpoint}±${config.humDeadband}%`);

                let pumpCooldownOk = true;
                if (pump.lastExecutedAt) {
                    const elapsed = (now - new Date(pump.lastExecutedAt).getTime()) / 1000;
                    const cd = config.cooldownSeconds || 60;
                    if (elapsed < cd) {
                        debug.push(`[HVAC: ${zoneName}/Pump] Cooldown: ${Math.ceil(cd - elapsed)}s remaining`);
                        pumpCooldownOk = false;
                    }
                }

                if (pumpCooldownOk) {
                    let pumpAction: "ON" | "OFF" | null = null;
                    const hUpper = config.humSetpoint + (config.humDeadband || 5);
                    const hLower = config.humSetpoint - (config.humDeadband || 5);

                    if (sData.hum_rh > hUpper) {
                        pumpAction = "ON"; // Too humid, pump needed
                        debug.push(`[HVAC: ${zoneName}/Pump] Humidity ${sData.hum_rh}% > ${hUpper}% → ON`);
                    } else if (sData.hum_rh < hLower) {
                        pumpAction = "OFF"; // Below target, stop pump
                        debug.push(`[HVAC: ${zoneName}/Pump] Humidity ${sData.hum_rh}% < ${hLower}% → OFF`);
                    } else {
                        debug.push(`[HVAC: ${zoneName}/Pump] Within dead-band, no action`);
                    }

                    if (pumpAction && pump.lastAction !== pumpAction) {
                        const pTopic = buildRelayTopic(pump.relayMac);
                        const pPayload = buildRelayPayload(pump.relayChannel || 1, pumpAction);
                        const pResult = await mqttPublish(pTopic, pPayload);
                        debug.push(`[HVAC: ${zoneName}/Pump] MQTT: ${pTopic} → ${JSON.stringify(pPayload)} — ${pResult.success ? "✓" : "✗ " + pResult.error}`);

                        if (pResult.success) executedCount++;
                        await db.collection("hvac_configs").updateOne({ _id: config._id }, { $set: { "pump.lastAction": pumpAction, "pump.lastExecutedAt": new Date(), updatedAt: new Date() } });
                        await db.collection("relay_log").insertOne({ ruleId: config._id.toString(), ruleName: `HVAC Pump: ${zoneName}`, relayMac: pump.relayMac, mqttTopic: pTopic, mqttPayload: pPayload, sensorMac: config.sensorMac, sensorData: { temp_c: sData.temp_c, hum_rh: sData.hum_rh }, matchedCondition: `Pump auto → ${pumpAction}`, action: pumpAction, channel: pump.relayChannel || 1, success: pResult.success, error: pResult.error || null, executedAt: new Date(), source: "hvac_auto_pump" });
                    } else if (pumpAction) {
                        debug.push(`[HVAC: ${zoneName}/Pump] Action unchanged (${pumpAction}), skipping`);
                    }
                }
            }

            // --- Evaluate AC (temperature-driven, cooling — ON when hot) ---
            const ac = config.ac;
            if (ac && ac.mode === "auto" && ac.relayMac) {
                const acSetpoint = config.acTempSetpoint ?? 26;
                const acDeadband = config.acTempDeadband ?? 1;
                debug.push(`[HVAC: ${zoneName}/AC] Setpoint: ${acSetpoint}±${acDeadband}°C`);

                let acCooldownOk = true;
                if (ac.lastExecutedAt) {
                    const elapsed = (now - new Date(ac.lastExecutedAt).getTime()) / 1000;
                    const cd = config.cooldownSeconds || 60;
                    if (elapsed < cd) {
                        debug.push(`[HVAC: ${zoneName}/AC] Cooldown: ${Math.ceil(cd - elapsed)}s remaining`);
                        acCooldownOk = false;
                    }
                }

                if (acCooldownOk) {
                    let acAction: "ON" | "OFF" | null = null;
                    const acUpper = acSetpoint + acDeadband;
                    const acLower = acSetpoint - acDeadband;

                    if (sData.temp_c > acUpper) {
                        acAction = "ON"; // Too hot, cooling needed
                        debug.push(`[HVAC: ${zoneName}/AC] Temp ${sData.temp_c}°C > ${acUpper}°C → ON`);
                    } else if (sData.temp_c < acLower) {
                        acAction = "OFF"; // Cool enough, stop AC
                        debug.push(`[HVAC: ${zoneName}/AC] Temp ${sData.temp_c}°C < ${acLower}°C → OFF`);
                    } else {
                        debug.push(`[HVAC: ${zoneName}/AC] Within dead-band, no action`);
                    }

                    if (acAction && ac.lastAction !== acAction) {
                        const aTopic = buildRelayTopic(ac.relayMac);
                        const aPayload = buildRelayPayload(ac.relayChannel || 1, acAction);
                        const aResult = await mqttPublish(aTopic, aPayload);
                        debug.push(`[HVAC: ${zoneName}/AC] MQTT: ${aTopic} → ${JSON.stringify(aPayload)} — ${aResult.success ? "✓" : "✗ " + aResult.error}`);

                        if (aResult.success) executedCount++;
                        await db.collection("hvac_configs").updateOne({ _id: config._id }, { $set: { "ac.lastAction": acAction, "ac.lastExecutedAt": new Date(), updatedAt: new Date() } });
                        await db.collection("relay_log").insertOne({ ruleId: config._id.toString(), ruleName: `HVAC AC: ${zoneName}`, relayMac: ac.relayMac, mqttTopic: aTopic, mqttPayload: aPayload, sensorMac: config.sensorMac, sensorData: { temp_c: sData.temp_c, hum_rh: sData.hum_rh }, matchedCondition: `AC auto → ${acAction}`, action: acAction, channel: ac.relayChannel || 1, success: aResult.success, error: aResult.error || null, executedAt: new Date(), source: "hvac_auto_ac" });
                    } else if (acAction) {
                        debug.push(`[HVAC: ${zoneName}/AC] Action unchanged (${acAction}), skipping`);
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            executed: executedCount,
            total: rules.length + hvacConfigs.length,
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

