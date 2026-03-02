import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendAlertEmail, buildAlertEmailHtml } from "@/lib/mailer";

export async function GET() {
    try {
        const db = await getDb();

        // Get alert config
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

        const alerts: Array<{ mac: string; temp: number; ts: string }> = [];

        for (const reading of latestReadings) {
            const temp = reading.latestDoc.json.temp_c;
            const mac = reading._id;
            const ts = reading.latestDoc.json.ts;

            if (temp >= config.tempSetpoint) {
                alerts.push({ mac, temp, ts });
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
                const html = buildAlertEmailHtml(
                    alert.mac,
                    alert.temp,
                    config.tempSetpoint,
                    alert.ts
                );
                try {
                    await sendAlertEmail(
                        config.email,
                        `🌡️ Temp Alert: ${alert.temp}°C on ${alert.mac}`,
                        html
                    );
                } catch (emailErr) {
                    console.error("Failed to send email:", emailErr);
                }
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
