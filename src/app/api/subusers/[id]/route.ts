import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth, hashPassword } from "@/lib/auth";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

// PUT: Update subuser
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = requireAuth(request);
        const { id } = await params;
        
        if (session.role === "subuser") {
            return NextResponse.json({ success: false, error: "Subusers cannot modify subusers" }, { status: 403 });
        }

        const body = await request.json();
        const { username, password, devices } = body;

        const db = await getDb();
        const targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });

        if (!targetUser) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
        }

        // Only the parent or admins can modify the subuser
        if (targetUser.parentId !== session.id && session.role !== "admin" && session.role !== "superadmin") {
            return NextResponse.json({ success: false, error: "Forbidden: Not your subuser" }, { status: 403 });
        }

        // Validate device subset for non-admins
        if (session.role === "user" && devices && Array.isArray(devices)) {
            const parentUser = await db.collection("users").findOne({ _id: new ObjectId(session.id) });
            const parentDevices = parentUser?.devices || [];
            const hasUnauthorizedDevices = devices.some(d => !parentDevices.includes(d));
            if (hasUnauthorizedDevices) {
                return NextResponse.json(
                    { success: false, error: "Cannot grant access to devices you don't own" },
                    { status: 403 }
                );
            }
        }

        const update: Record<string, any> = { updatedAt: new Date() };
        if (username) update.username = username.toLowerCase();
        if (devices !== undefined) update.devices = devices;
        if (password) update.password = await hashPassword(password);

        await db.collection("users").updateOne(
            { _id: new ObjectId(id) },
            { $set: update }
        );

        return NextResponse.json({ success: true, message: "Subuser updated" });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to update subuser";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}

// DELETE: Delete subuser
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = requireAuth(request);
        const { id } = await params;

        if (session.role === "subuser") {
            return NextResponse.json({ success: false, error: "Subusers cannot delete subusers" }, { status: 403 });
        }

        const db = await getDb();
        const targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });

        if (!targetUser) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
        }

        // Only the parent or admins can delete the subuser
        if (targetUser.parentId !== session.id && session.role !== "admin" && session.role !== "superadmin") {
            return NextResponse.json({ success: false, error: "Forbidden: Not your subuser" }, { status: 403 });
        }

        await db.collection("users").deleteOne({ _id: new ObjectId(id) });

        return NextResponse.json({ success: true, message: "Subuser deleted" });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to delete subuser";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
