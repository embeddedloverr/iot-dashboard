import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const OFFLINE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function GET() {
    try {
        const db = await getDb();

        // Get device aliases for location mapping
        const aliasesArr = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const a of aliasesArr) {
            aliasMap[a.mac] = a.alias;
        }

        // Get device alert configs
        const deviceConfigs = await db.collection("device_alert_config").find({}).toArray();
        const configMap: Record<string, { tempSetpoint: number; enabled: boolean }> = {};
        for (const dc of deviceConfigs) {
            configMap[dc.mac] = { tempSetpoint: dc.tempSetpoint, enabled: dc.enabled };
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
                {
                    $addFields: {
                        mongoTs: { $toDate: "$latestDoc._id" },
                    },
                },
            ])
            .toArray();

        const errors: Array<{ mac: string; location: string; error: string; timestamp: string; details?: any }> = [];
        const alertStatuses: Array<{ mac: string; location: string; timestamp: string; temp_c: number | null; isOffline: number; isTempAlert: number }> = [];
        const now = Date.now();

        for (const reading of latestReadings) {
            const jsonDoc = reading.latestDoc.json;
            const mac = reading._id;
            const ts = jsonDoc?.ts || new Date(reading.mongoTs).toISOString();
            const location = aliasMap[mac] || mac;
            
            const lastSeenTime = new Date(reading.mongoTs).getTime();
            const isOffline = (now - lastSeenTime) > OFFLINE_THRESHOLD_MS;
            
            let isTempAlert = 0;
            const temp = jsonDoc?.temp_c;
            const config = configMap[mac];

            if (config && config.enabled && temp !== undefined && temp !== null && temp >= config.tempSetpoint) {
                isTempAlert = 1;
            }

            alertStatuses.push({
                mac,
                location,
                timestamp: ts,
                temp_c: temp !== undefined ? temp : null,
                isOffline: isOffline ? 1 : 0,
                isTempAlert: isTempAlert
            });

            if (isOffline) {
                const minutesOffline = Math.floor((now - lastSeenTime) / 60000);
                errors.push({
                    mac,
                    location,
                    error: "offline",
                    timestamp: new Date(lastSeenTime).toISOString(),
                    details: {
                        minutesOffline
                    }
                });
            } else if (temp === undefined || temp === null) {
                // If the device is online but sending null or invalid temperature
                errors.push({
                    mac,
                    location,
                    error: "invalid_data",
                    timestamp: ts,
                    details: {
                        message: "Sensor reported invalid or missing temperature data"
                    }
                });
            } else if (isTempAlert === 1 && config) {
                // optionally add temperature alert to the general errors list
                errors.push({
                    mac,
                    location,
                    error: "temp_setpoint_exceeded",
                    timestamp: ts,
                    details: {
                        temp_c: temp,
                        setpoint: config.tempSetpoint
                    }
                });
            }
        }

        return NextResponse.json({
            success: true,
            errors,
            alertStatuses,
            totalErrors: errors.length,
        });

    } catch (error) {
        console.error("Error fetching sensor errors:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch sensor errors" },
            { status: 500 }
        );
    }
}
