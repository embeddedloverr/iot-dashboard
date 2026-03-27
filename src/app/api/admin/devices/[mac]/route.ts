import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ mac: string }> }
) {
    try {
        const session = getSession(request);
        if (!session || (session.role !== "superadmin" && session.role !== "admin")) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { mac } = await context.params;

        if (!mac) {
             return NextResponse.json({ success: false, error: "mac parameter missing" }, { status: 400 });
        }

        const db = await getDb();
        
        // Remove from device_aliases
        await db.collection("device_aliases").deleteOne({ mac });
        
        // Also remove from device_alert_config to clean up config
        await db.collection("device_alert_config").deleteOne({ mac });

        // Note: we do not delete from mqtt_packets to preserve historical data
        return NextResponse.json({ success: true, message: "Device deleted" });
    } catch (error) {
        console.error("Error deleting device:", error);
        return NextResponse.json({ success: false, error: "Failed to delete" }, { status: 500 });
    }
}
