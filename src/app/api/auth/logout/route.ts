import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 0,
        path: "/",
    });
    return response;
}
