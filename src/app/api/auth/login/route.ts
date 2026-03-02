import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, signToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { success: false, error: "Username and password required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const user = await db.collection("users").findOne({ username: username.toLowerCase() });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "Invalid credentials" },
                { status: 401 }
            );
        }

        const valid = await verifyPassword(password, user.password);
        if (!valid) {
            return NextResponse.json(
                { success: false, error: "Invalid credentials" },
                { status: 401 }
            );
        }

        const token = signToken({
            id: user._id.toString(),
            username: user.username,
            role: user.role,
        });

        const response = NextResponse.json({
            success: true,
            user: {
                id: user._id.toString(),
                username: user.username,
                role: user.role,
            },
        });

        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json(
            { success: false, error: "Login failed" },
            { status: 500 }
        );
    }
}
