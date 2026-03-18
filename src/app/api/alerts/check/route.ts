import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendAlertEmail, buildAlertEmailHtml } from "@/lib/mailer";

const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function GET() {
    try {
        const db = await getDb();

        // Get per-device alert configs (each has its own emails, setpoint, enabled)
        const deviceConfigs = await db.collection("device_alert_config").find({}).toArray();
        const deviceConfigMap: Record<string, { tempSetpoint: number; enabled: boolean; emails: string[] }> = {};
        for (const dc of deviceConfigs) {
            deviceConfigMap[dc.mac] = { tempSetpoint: dc.tempSetpoint, enabled: dc.enabled, emails: dc.emails || [] };
        }

        // If no devices have alert configs, nothing to check
        if (Object.keys(deviceConfigMap).length === 0) {
            return NextResponse.json({
                success: true,
                message: "No device alert configs found",
                triggered: false,
            });
        }

        // Get device aliases for readable emails
        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) {
            aliasMap[a.mac] = a.alias;
        }

        // Get latest readings for all devices (with mongoTs)
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
                {
                    $addFields: {
                        mongoTs: { $toDate: "$latestDoc._id" },
                    },
                },
            ])
            .toArray();

        const tempAlerts: Array<{ mac: string; alias: string; temp: number; setpoint: number; ts: string; emails: string[] }> = [];
        const offlineAlerts: Array<{ mac: string; alias: string; lastSeen: Date; minutesAgo: number; emails: string[] }> = [];

        const now = Date.now();

        for (const reading of latestReadings) {
            const temp = reading.latestDoc.json.temp_c;
            const mac = reading._id;
            const ts = reading.latestDoc.json.ts;
            const alias = aliasMap[mac] || mac;
            const lastSeenTime = new Date(reading.mongoTs).getTime();
            const isOffline = (now - lastSeenTime) > OFFLINE_THRESHOLD_MS;

            // Check if device has an alert config
            const deviceCfg = deviceConfigMap[mac];
            if (!deviceCfg || !deviceCfg.enabled) continue;

            const setpoint = deviceCfg.tempSetpoint;
            const emails = deviceCfg.emails || [];

            // Check temperature alerts
            if (temp >= setpoint && emails.length > 0) {
                tempAlerts.push({ mac, alias, temp, setpoint, ts, emails });
            }

            // Check offline status
            if (isOffline && emails.length > 0) {
                const minutesAgo = Math.floor((now - lastSeenTime) / 60000);
                offlineAlerts.push({ mac, alias, lastSeen: new Date(reading.mongoTs), minutesAgo, emails });
            }
        }

        let triggered = false;

        // Send temperature alerts (per-device cooldown: 5 minutes)
        if (tempAlerts.length > 0) {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

            for (const alert of tempAlerts) {
                // Check per-device cooldown
                const recentAlert = await db.collection("alert_history").findOne({
                    type: "temperature",
                    mac: alert.mac,
                    triggeredAt: { $gt: fiveMinAgo },
                });
                if (recentAlert) continue;

                const deviceLabel = alert.alias !== alert.mac ? `${alert.alias} (${alert.mac})` : alert.mac;
                const html = buildAlertEmailHtml(deviceLabel, alert.temp, alert.setpoint, alert.ts);
                const toList = alert.emails.join(",");
                try {
                    await sendAlertEmail(toList, `🌡️ Temp Alert: ${alert.temp}°C on ${alert.alias}`, html);
                } catch (emailErr) {
                    console.error("Failed to send temp alert email:", emailErr);
                }

                await db.collection("alert_history").insertOne({
                    type: "temperature",
                    mac: alert.mac,
                    alias: alert.alias,
                    temp: alert.temp,
                    setpoint: alert.setpoint,
                    email: toList,
                    triggeredAt: new Date(),
                    sensorTs: alert.ts,
                    details: `${alert.alias}: ${alert.temp}°C exceeded setpoint ${alert.setpoint}°C`,
                });
                triggered = true;
            }
        }

        // Send offline alerts (per-device, 1 hour cooldown)
        if (offlineAlerts.length > 0) {
            for (const offlineDevice of offlineAlerts) {
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                const recentOfflineAlert = await db.collection("alert_history").findOne({
                    type: "offline",
                    mac: offlineDevice.mac,
                    triggeredAt: { $gt: oneHourAgo },
                });

                if (!recentOfflineAlert) {
                    const deviceLabel = offlineDevice.alias !== offlineDevice.mac
                        ? `${offlineDevice.alias} (${offlineDevice.mac})`
                        : offlineDevice.mac;

                    const timeAgo = offlineDevice.minutesAgo < 60
                        ? `${offlineDevice.minutesAgo} minutes`
                        : `${Math.floor(offlineDevice.minutesAgo / 60)}h ${offlineDevice.minutesAgo % 60}m`;

                    const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a0a1a; color: #e8e8ff; border-radius: 16px; overflow: hidden;">
                        <div style="background: linear-gradient(135deg, #ef4444, #f97316); padding: 24px; text-align: center;">
                            <h1 style="margin: 0; font-size: 20px; color: white;">⚠️ Device Offline Alert</h1>
                            <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">SmartDwell IoT Monitor</p>
                        </div>
                        <div style="padding: 24px;">
                            <p style="font-size: 15px; line-height: 1.6;">Device <strong>${deviceLabel}</strong> has been offline.</p>
                            <div style="margin: 16px 0; padding: 16px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px;">
                                <p style="margin: 0 0 8px; font-size: 13px; color: #ef4444; font-weight: 600;">🔴 Status: OFFLINE</p>
                                <p style="margin: 0; font-size: 13px; color: #8888bb;">Last seen: ${timeAgo} ago</p>
                                <p style="margin: 4px 0 0; font-size: 13px; color: #8888bb;">Last data at: ${offlineDevice.lastSeen.toLocaleString()}</p>
                            </div>
                            <p style="font-size: 13px; color: #8888bb;">Please check the sensor device and its WiFi connection.</p>
                        </div>
                        <div style="padding: 16px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08);">
                            <p style="margin: 0; font-size: 11px; color: #8888bb;">Smartdwell Technologies · IoT Monitoring Dashboard</p>
                        </div>
                    </div>`;

                    const toList = offlineDevice.emails.join(",");
                    try {
                        await sendAlertEmail(toList, `⚠️ Device Offline: ${offlineDevice.alias} — no data for ${timeAgo}`, html);
                    } catch (emailErr) {
                        console.error("Failed to send offline alert:", emailErr);
                    }

                    await db.collection("alert_history").insertOne({
                        type: "offline",
                        mac: offlineDevice.mac,
                        alias: offlineDevice.alias,
                        email: toList,
                        triggeredAt: new Date(),
                        lastSeen: offlineDevice.lastSeen,
                        minutesAgo: offlineDevice.minutesAgo,
                        details: `${offlineDevice.alias} offline — no data for ${timeAgo}`,
                    });

                    triggered = true;
                }
            }
        }

        return NextResponse.json({
            success: true,
            triggered,
            tempAlerts: tempAlerts.length,
            offlineAlerts: offlineAlerts.length,
            alerts: tempAlerts.map(a => ({ mac: a.mac, alias: a.alias, temp: a.temp, setpoint: a.setpoint })),
            offlineDevices: offlineAlerts.map((d) => ({ mac: d.mac, alias: d.alias, minutesAgo: d.minutesAgo })),
        });
    } catch (error) {
        console.error("Error checking alerts:", error);
        return NextResponse.json(
            { success: false, error: "Failed to check alerts" },
            { status: 500 }
        );
    }
}
