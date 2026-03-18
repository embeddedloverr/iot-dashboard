import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const isHttps = request.headers.get("x-forwarded-proto") === "https" || request.url.startsWith("https");

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });
    return response;
}
