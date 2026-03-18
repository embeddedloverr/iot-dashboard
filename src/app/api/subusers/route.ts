import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth, hashPassword } from "@/lib/auth";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

// GET: List all subusers for the current user
export async function GET(request: NextRequest) {
    try {
        const session = requireAuth(request);

        if (session.role === "subuser") {
            return NextResponse.json({ success: false, error: "Subusers cannot manage subusers" }, { status: 403 });
        }

        const db = await getDb();
        const subusers = await db
            .collection("users")
            .find({ parentId: session.id }, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();

        return NextResponse.json({ success: true, data: subusers });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to fetch subusers";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}

// POST: Create a new subuser
export async function POST(request: NextRequest) {
    try {
        const session = requireAuth(request);
        
        if (session.role === "subuser") {
            return NextResponse.json({ success: false, error: "Subusers cannot create subusers" }, { status: 403 });
        }

        const body = await request.json();
        const { username, password, devices } = body;

        if (!username || !password) {
            return NextResponse.json(
                { success: false, error: "Username and password required" },
                { status: 400 }
            );
        }

        const db = await getDb();

        // Check if parent user has access to these devices (if they are not an admin)
        if (session.role === "user") {
            const parentUser = await db.collection("users").findOne({ _id: new ObjectId(session.id) });
            const parentDevices = parentUser?.devices || [];
            
            // Validate that requested devices are a subset of parent devices
            if (devices && Array.isArray(devices)) {
                const hasUnauthorizedDevices = devices.some(d => !parentDevices.includes(d));
                if (hasUnauthorizedDevices) {
                    return NextResponse.json(
                        { success: false, error: "Cannot grant access to devices you don't own" },
                        { status: 403 }
                    );
                }
            }
        }

        // Check duplicate username
        const existing = await db.collection("users").findOne({ username: username.toLowerCase() });
        if (existing) {
            return NextResponse.json(
                { success: false, error: "Username already exists" },
                { status: 409 }
            );
        }

        const hashedPassword = await hashPassword(password);
        const newSubuser = {
            username: username.toLowerCase(),
            password: hashedPassword,
            role: "subuser",
            parentId: session.id, // Link to the creator
            devices: devices || [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await db.collection("users").insertOne(newSubuser);

        return NextResponse.json({
            success: true,
            data: {
                _id: result.insertedId,
                username: newSubuser.username,
                role: newSubuser.role,
                devices: newSubuser.devices,
            },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to create subuser";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
