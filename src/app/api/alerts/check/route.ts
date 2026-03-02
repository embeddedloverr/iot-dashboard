import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendAlertEmail, buildAlertEmailHtml } from "@/lib/mailer";

export async function GET() {
    try {
        const db = await getDb();

        // Get global alert config
        const config = await db
            .collection("alert_config")
            .findOne({ _id: "default" as unknown as import("mongodb").ObjectId });

        if (!config || !config.enabled) {
            return NextResponse.json({
                success: true,
                message: "Alerts not enabled",
                triggered: false,
            });
        }

        // Get per-device alert configs
        const deviceConfigs = await db.collection("device_alert_config").find({}).toArray();
        const deviceConfigMap: Record<string, { tempSetpoint: number; enabled: boolean }> = {};
        for (const dc of deviceConfigs) {
            deviceConfigMap[dc.mac] = { tempSetpoint: dc.tempSetpoint, enabled: dc.enabled };
        }

        // Get device aliases for readable emails
        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) {
            aliasMap[a.mac] = a.alias;
        }

        // Get latest readings for all devices
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

        const alerts: Array<{ mac: string; alias: string; temp: number; setpoint: number; ts: string }> = [];

        for (const reading of latestReadings) {
            const temp = reading.latestDoc.json.temp_c;
            const mac = reading._id;
            const ts = reading.latestDoc.json.ts;

            // Use per-device config if it exists, otherwise fall back to global
            const deviceCfg = deviceConfigMap[mac];
            const setpoint = deviceCfg ? deviceCfg.tempSetpoint : config.tempSetpoint;
            const deviceEnabled = deviceCfg ? deviceCfg.enabled : true;

            if (deviceEnabled && temp >= setpoint) {
                alerts.push({ mac, alias: aliasMap[mac] || mac, temp, setpoint, ts });
            }
        }

        if (alerts.length > 0) {
            // Check cooldown — don't send more than once every 5 minutes
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (config.lastTriggered && new Date(config.lastTriggered) > fiveMinAgo) {
                return NextResponse.json({
                    success: true,
                    message: "Alert in cooldown period",
                    triggered: false,
                    alerts,
                });
            }

            // Send email for each breached device
            for (const alert of alerts) {
                const deviceLabel = alert.alias !== alert.mac ? `${alert.alias} (${alert.mac})` : alert.mac;
                const html = buildAlertEmailHtml(
                    deviceLabel,
                    alert.temp,
                    alert.setpoint,
                    alert.ts
                );
                try {
                    await sendAlertEmail(
                        config.email,
                        `🌡️ Temp Alert: ${alert.temp}°C on ${alert.alias}`,
                        html
                    );
                } catch (emailErr) {
                    console.error("Failed to send email:", emailErr);
                }
            }

            // Log each alert to history
            for (const alert of alerts) {
                await db.collection("alert_history").insertOne({
                    type: "temperature",
                    mac: alert.mac,
                    alias: alert.alias,
                    temp: alert.temp,
                    setpoint: alert.setpoint,
                    email: config.email,
                    triggeredAt: new Date(),
                    sensorTs: alert.ts,
                    details: `${alert.alias}: ${alert.temp}°C exceeded setpoint ${alert.setpoint}°C`,
                });
            }

            // Update last triggered
            await db.collection("alert_config").updateOne(
                { _id: "default" as unknown as import("mongodb").ObjectId },
                { $set: { lastTriggered: new Date() } }
            );

            return NextResponse.json({
                success: true,
                triggered: true,
                alertCount: alerts.length,
                alerts,
            });
        }

        return NextResponse.json({
            success: true,
            triggered: false,
            message: "All readings within range",
        });
    } catch (error) {
        console.error("Error checking alerts:", error);
        return NextResponse.json(
            { success: false, error: "Failed to check alerts" },
            { status: 500 }
        );
    }
}
