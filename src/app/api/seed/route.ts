// TEMPORARY: One-time seed endpoint. DELETE after use!
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        const db = await getDb();
        const existing = await db.collection("users").findOne({ username: "admin" });

        if (existing) {
            return NextResponse.json({ success: false, message: "Admin user already exists. Seed not needed." });
        }

        const hashedPassword = await bcrypt.hash("admin123", 12);
        await db.collection("users").insertOne({
            username: "admin",
            password: hashedPassword,
            role: "superadmin",
            devices: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await db.collection("users").createIndex({ username: 1 }, { unique: true });

        return NextResponse.json({
            success: true,
            message: "✅ Superadmin created! Username: admin, Password: admin123. DELETE this endpoint now!",
        });
    } catch (error) {
        console.error("Seed error:", error);
        return NextResponse.json({ success: false, error: "Seed failed" }, { status: 500 });
    }
}
