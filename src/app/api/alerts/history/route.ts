import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET: Retrieve alert trigger history
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

        const db = await getDb();
        const history = await db
            .collection("alert_history")
            .find({})
            .sort({ triggeredAt: -1 })
            .limit(limit)
            .toArray();

        return NextResponse.json({ success: true, data: history });
    } catch (error) {
        console.error("Error fetching alert history:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch alert history" },
            { status: 500 }
        );
    }
}
