// TEMPORARY: Reset admin password. DELETE after use!
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET() {
    try {
        const db = await getDb();
        const hashedPassword = await bcrypt.hash("admin123", 12);

        const result = await db.collection("users").updateOne(
            { username: "admin" },
            {
                $set: {
                    password: hashedPassword,
                    role: "superadmin",
                    updatedAt: new Date(),
                },
            }
        );

        if (result.matchedCount === 0) {
            // User doesn't exist, create it
            await db.collection("users").insertOne({
                username: "admin",
                password: hashedPassword,
                role: "superadmin",
                devices: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            return NextResponse.json({ success: true, message: "Admin created with password: admin123" });
        }

        return NextResponse.json({ success: true, message: "Admin password reset to: admin123" });
    } catch (error) {
        console.error("Reset error:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
