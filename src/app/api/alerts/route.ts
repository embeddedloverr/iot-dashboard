import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Retrieve current alert configuration
export async function GET() {
    try {
        const db = await getDb();
        const config = await db.collection("alert_config").findOne({ _id: "default" as unknown as import("mongodb").ObjectId });

        if (!config) {
            return NextResponse.json({
                success: true,
                data: {
                    email: "",
                    tempSetpoint: 40,
                    humSetpoint: 80,
                    enabled: false,
                    lastTriggered: null,
                },
            });
        }

        return NextResponse.json({ success: true, data: config });
    } catch (error) {
        console.error("Error fetching alert config:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch alert config" },
            { status: 500 }
        );
    }
}

// POST: Save alert configuration
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, tempSetpoint, humSetpoint, enabled } = body;

        if (!email || typeof tempSetpoint !== "number") {
            return NextResponse.json(
                { success: false, error: "email and tempSetpoint are required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        await db.collection("alert_config").updateOne(
            { _id: "default" as unknown as import("mongodb").ObjectId },
            {
                $set: {
                    email,
                    tempSetpoint,
                    humSetpoint: humSetpoint || 80,
                    enabled: enabled !== false,
                    updatedAt: new Date(),
                },
            },
            { upsert: true }
        );

        return NextResponse.json({ success: true, message: "Alert config saved" });
    } catch (error) {
        console.error("Error saving alert config:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save alert config" },
            { status: 500 }
        );
    }
}
