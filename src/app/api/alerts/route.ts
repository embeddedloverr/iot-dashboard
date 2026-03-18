import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Retrieve current alert configuration
export async function GET() {
    try {
        const db = await getDb();
        let config = await db.collection("alert_config").findOne({ _id: "default" as unknown as import("mongodb").ObjectId });

        if (!config) {
            return NextResponse.json({
                success: true,
                data: {
                    emails: [],
                    tempSetpoint: 40,
                    humSetpoint: 80,
                    enabled: false,
                    lastTriggered: null,
                },
            });
        }

        // Migrate legacy single email to emails array
        if (config.email && (!config.emails || config.emails.length === 0)) {
            config.emails = [config.email];
            delete config.email;
        } else if (!config.emails) {
            config.emails = [];
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
        const { emails, tempSetpoint, humSetpoint, enabled } = body;

        if (!Array.isArray(emails) || typeof tempSetpoint !== "number") {
            return NextResponse.json(
                { success: false, error: "emails array and tempSetpoint are required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        await db.collection("alert_config").updateOne(
            { _id: "default" as unknown as import("mongodb").ObjectId },
            {
                $set: {
                    emails,
                    tempSetpoint,
                    humSetpoint: humSetpoint || 80,
                    enabled: enabled !== false,
                    updatedAt: new Date(),
                },
                $unset: { email: "" } // remove legacy field
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
