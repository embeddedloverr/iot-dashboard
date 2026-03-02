import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Retrieve all device aliases
export async function GET() {
    try {
        const db = await getDb();
        const aliases = await db.collection("device_aliases").find({}).toArray();
        const aliasMap: Record<string, string> = {};
        for (const doc of aliases) {
            aliasMap[doc.mac] = doc.alias;
        }
        return NextResponse.json({ success: true, data: aliasMap });
    } catch (error) {
        console.error("Error fetching aliases:", error);
        return NextResponse.json({ success: false, error: "Failed to fetch aliases" }, { status: 500 });
    }
}

// POST: Set alias for a device
export async function POST(request: NextRequest) {
    try {
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

        return NextResponse.json({ success: true, message: `Alias "${alias}" set for ${mac}` });
    } catch (error) {
        console.error("Error saving alias:", error);
        return NextResponse.json({ success: false, error: "Failed to save alias" }, { status: 500 });
    }
}
