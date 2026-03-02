import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { ObjectId } from "mongodb";

// PUT: Update user
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = requireAdmin(request);
        const { id } = await params;
        const body = await request.json();
        const { username, password, role, devices } = body;

        const db = await getDb();
        const targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });

        if (!targetUser) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
        }

        // Protect superadmin
        if (targetUser.role === "superadmin" && session.role !== "superadmin") {
            return NextResponse.json({ success: false, error: "Cannot modify superadmin" }, { status: 403 });
        }

        if (role === "superadmin") {
            return NextResponse.json({ success: false, error: "Cannot set role to superadmin" }, { status: 403 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: Record<string, any> = { updatedAt: new Date() };
        if (username) update.username = username.toLowerCase();
        if (role) update.role = role;
        if (devices !== undefined) update.devices = devices;
        if (password) update.password = await hashPassword(password);

        await db.collection("users").updateOne(
            { _id: new ObjectId(id) },
            { $set: update }
        );

        return NextResponse.json({ success: true, message: "User updated" });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to update user";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}

// DELETE: Delete user
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = requireAdmin(request);
        const { id } = await params;

        const db = await getDb();
        const targetUser = await db.collection("users").findOne({ _id: new ObjectId(id) });

        if (!targetUser) {
            return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
        }

        if (targetUser.role === "superadmin") {
            return NextResponse.json({ success: false, error: "Cannot delete superadmin" }, { status: 403 });
        }

        if (targetUser.role === "admin" && session.role !== "superadmin") {
            return NextResponse.json({ success: false, error: "Only superadmin can delete admins" }, { status: 403 });
        }

        await db.collection("users").deleteOne({ _id: new ObjectId(id) });

        return NextResponse.json({ success: true, message: "User deleted" });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to delete user";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
