import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ObjectId } from "mongodb";

// Helper: get user's allowed devices
async function getUserDevices(request: NextRequest): Promise<{ userId: string; role: string; devices: string[] } | null> {
    const session = getSession(request);
    if (!session) return null;

    const db = await getDb();
    const user = await db.collection("users").findOne(
        { _id: new ObjectId(session.id) },
        { projection: { role: 1, devices: 1 } }
    );
    if (!user) return null;

    const isAdmin = user.role === "superadmin" || user.role === "admin";
    return {
        userId: session.id,
        role: user.role,
        devices: isAdmin ? [] : (user.devices || []), // empty = all devices for admins
    };
}

// GET: Retrieve per-device alert configs (filtered by user's devices)
export async function GET(request: NextRequest) {
    try {
        const userInfo = await getUserDevices(request);
        if (!userInfo) {
            return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
        }

        const db = await getDb();

        // Get per-device configs
        const deviceConfigs = await db.collection("device_alert_config").find({}).toArray();
        const deviceMap: Record<string, { tempSetpoint: number; enabled: boolean; emails: string[] }> = {};
        for (const doc of deviceConfigs) {
            // If user is not admin, only return configs for their assigned devices
            if (userInfo.devices.length > 0 && !userInfo.devices.includes(doc.mac)) continue;
            deviceMap[doc.mac] = { tempSetpoint: doc.tempSetpoint, enabled: doc.enabled, emails: doc.emails || [] };
        }

        return NextResponse.json({
            success: true,
            data: { devices: deviceMap },
        });
    } catch (error) {
        console.error("Error fetching device alerts:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch" }, { status: 500 });
    }
}

// POST: Save per-device alert config (user can only configure their assigned devices)
export async function POST(request: NextRequest) {
    try {
        const userInfo = await getUserDevices(request);
        if (!userInfo) {
            return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
        }

        const body = await request.json();
        const { mac, tempSetpoint, enabled, emails } = body;

        if (!mac || typeof tempSetpoint !== "number") {
            return NextResponse.json(
                { success: false, error: "mac and tempSetpoint are required" },
                { status: 400 }
            );
        }

        // Regular users can only configure their assigned devices
        if (userInfo.devices.length > 0 && !userInfo.devices.includes(mac)) {
            return NextResponse.json(
                { success: false, error: "You do not have access to this device" },
                { status: 403 }
            );
        }

        const db = await getDb();
        await db.collection("device_alert_config").updateOne(
            { mac },
            { $set: { mac, tempSetpoint, enabled: enabled !== false, emails: emails || [], updatedAt: new Date(), updatedBy: userInfo.userId } },
            { upsert: true }
        );

        return NextResponse.json({ success: true, message: `Alert config saved for ${mac}` });
    } catch (error) {
        console.error("Error saving device alert:", error);
        return NextResponse.json({ success: false, error: "Failed to save" }, { status: 500 });
    }
}

// DELETE: Remove per-device alert config
export async function DELETE(request: NextRequest) {
    try {
        const userInfo = await getUserDevices(request);
        if (!userInfo) {
            return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const mac = searchParams.get("mac");
        if (!mac) {
            return NextResponse.json({ success: false, error: "mac required" }, { status: 400 });
        }

        // Regular users can only delete configs for their assigned devices
        if (userInfo.devices.length > 0 && !userInfo.devices.includes(mac)) {
            return NextResponse.json(
                { success: false, error: "You do not have access to this device" },
                { status: 403 }
            );
        }

        const db = await getDb();
        await db.collection("device_alert_config").deleteOne({ mac });
        return NextResponse.json({ success: true, message: `Device alert config removed for ${mac}` });
    } catch (error) {
        console.error("Error deleting device alert:", error);
        return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
    }
}
