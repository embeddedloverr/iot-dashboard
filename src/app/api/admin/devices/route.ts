import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const db = await getDb();
        
        // Fetch manually assigned aliases
        const aliases = await db.collection("device_aliases").find({}).toArray();
        const aliasMap = new Map();
        aliases.forEach(doc => {
            aliasMap.set(doc.mac, doc);
        });

        // Also fetch from mqtt_packets to find discovered devices
        const discovered = await db.collection("mqtt_packets")
            .aggregate([
                { $match: { topic: "smartdwell/sensor/temp" } },
                {
                    $group: {
                        _id: "$json.mac",
                        lastSeen: { $last: "$json.ts" },
                    },
                }
            ])
            .toArray();

        // Merge them
        const allDevices = new Map();
        
        // Add discovered first
        for (const d of discovered) {
            allDevices.set(d._id, {
                mac: d._id,
                alias: d._id, // Default alias is mac
                lastSeen: d.lastSeen,
                isDiscovered: true
            });
        }

        // Overlay with alias data
        for (const a of aliases) {
            if (allDevices.has(a.mac)) {
                const existing = allDevices.get(a.mac);
                existing.alias = a.alias;
                existing.updatedAt = a.updatedAt;
                existing.isRegistered = true;
            } else {
                allDevices.set(a.mac, {
                    mac: a.mac,
                    alias: a.alias,
                    updatedAt: a.updatedAt,
                    isRegistered: true,
                    isDiscovered: false
                });
            }
        }

        return NextResponse.json({ success: true, data: Array.from(allDevices.values()) });
    } catch (error) {
        console.error("Error fetching admin devices:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch devices" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { mac, alias } = body;

        if (!mac || !alias) {
            return NextResponse.json(
                { success: false, error: "mac and alias are required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        await db.collection("device_aliases").updateOne(
            { mac },
            { $set: { mac, alias, updatedAt: new Date() } },
            { upsert: true }
        );

        return NextResponse.json({ success: true, message: `Device saved` });
    } catch (error) {
        console.error("Error saving device:", error);
        return NextResponse.json({ success: false, error: "Failed to save device" }, { status: 500 });
    }
}
