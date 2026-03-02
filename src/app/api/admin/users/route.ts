import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";

// GET: List all users (admin only)
export async function GET(request: NextRequest) {
    try {
        const session = requireAdmin(request);

        const db = await getDb();
        const users = await db
            .collection("users")
            .find({}, { projection: { password: 0 } })
            .sort({ createdAt: -1 })
            .toArray();

        // Non-superadmins can't see superadmin users
        const filtered = session.role === "superadmin"
            ? users
            : users.filter((u) => u.role !== "superadmin");

        return NextResponse.json({ success: true, data: filtered });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to fetch users";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}

// POST: Create new user (admin only)
export async function POST(request: NextRequest) {
    try {
        const session = requireAdmin(request);
        const body = await request.json();
        const { username, password, role, devices } = body;

        if (!username || !password) {
            return NextResponse.json(
                { success: false, error: "Username and password required" },
                { status: 400 }
            );
        }

        // Only superadmins can create admins
        if (role === "superadmin") {
            return NextResponse.json(
                { success: false, error: "Cannot create superadmin accounts" },
                { status: 403 }
            );
        }

        if (role === "admin" && session.role !== "superadmin") {
            return NextResponse.json(
                { success: false, error: "Only superadmin can create admin accounts" },
                { status: 403 }
            );
        }

        const db = await getDb();

        // Check duplicate username
        const existing = await db.collection("users").findOne({ username: username.toLowerCase() });
        if (existing) {
            return NextResponse.json(
                { success: false, error: "Username already exists" },
                { status: 409 }
            );
        }

        const hashedPassword = await hashPassword(password);
        const newUser = {
            username: username.toLowerCase(),
            password: hashedPassword,
            role: role || "user",
            devices: devices || [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await db.collection("users").insertOne(newUser);

        return NextResponse.json({
            success: true,
            data: {
                _id: result.insertedId,
                username: newUser.username,
                role: newUser.role,
                devices: newUser.devices,
            },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Failed to create user";
        const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
        return NextResponse.json({ success: false, error: msg }, { status });
    }
}
