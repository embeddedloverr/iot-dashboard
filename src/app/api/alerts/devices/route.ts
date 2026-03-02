import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Retrieve all per-device alert configs
export async function GET() {
    try {
        const db = await getDb();

        // Get global config
        const globalConfig = await db.collection("alert_config")
            .findOne({ _id: "default" as unknown as import("mongodb").ObjectId });

        // Get per-device configs
        const deviceConfigs = await db.collection("device_alert_config").find({}).toArray();
        const deviceMap: Record<string, { tempSetpoint: number; enabled: boolean }> = {};
        for (const doc of deviceConfigs) {
            deviceMap[doc.mac] = { tempSetpoint: doc.tempSetpoint, enabled: doc.enabled };
        }

        return NextResponse.json({
            success: true,
            data: {
                global: globalConfig || { email: "", tempSetpoint: 40, enabled: false },
                devices: deviceMap,
            },
        });
    } catch (error) {
        console.error("Error fetching device alerts:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
    }
}

// POST: Save per-device alert config
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { mac, tempSetpoint, enabled } = body;

        if (!mac || typeof tempSetpoint !== "number") {
            return NextResponse.json(
                { success: false, error: "mac and tempSetpoint are required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        await db.collection("device_alert_config").updateOne(
            { mac },
            { $set: { mac, tempSetpoint, enabled: enabled !== false, updatedAt: new Date() } },
            { upsert: true }
        );

        return NextResponse.json({ success: true, message: `Alert config saved for ${mac}` });
    } catch (error) {
        console.error("Error saving device alert:", error);
        return NextResponse.json({ success: false, error: "Failed to save" }, { status: 500 });
    }
}

// DELETE: Remove per-device alert config (falls back to global)
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const mac = searchParams.get("mac");
        if (!mac) {
            return NextResponse.json({ success: false, error: "mac required" }, { status: 400 });
        }

        const db = await getDb();
        await db.collection("device_alert_config").deleteOne({ mac });
        return NextResponse.json({ success: true, message: `Device alert config removed for ${mac}` });
    } catch (error) {
        console.error("Error deleting device alert:", error);
        return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
    }
}
