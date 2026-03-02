import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(request: NextRequest) {
    try {
        const session = getSession(request);
        if (!session) {
            return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
        }

        const db = await getDb();
        const user = await db.collection("users").findOne(
            { _id: new ObjectId(session.id) },
            { projection: { password: 0 } }
        );

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 401 });
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user._id.toString(),
                username: user.username,
                role: user.role,
                devices: user.devices || [],
            },
        });
    } catch (error) {
        console.error("Session check error:", error);
        return NextResponse.json({ success: false, error: "Session invalid" }, { status: 401 });
    }
}
