import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "smartdwell-default-secret";
const COOKIE_NAME = "smartdwell_token";

export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
}

export interface TokenPayload {
    id: string;
    username: string;
    role: "superadmin" | "admin" | "user";
}

export function signToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch {
        return null;
    }
}

export function getSession(request: NextRequest): TokenPayload | null {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

export function requireAuth(request: NextRequest): TokenPayload {
    const session = getSession(request);
    if (!session) throw new Error("Unauthorized");
    return session;
}

export function requireAdmin(request: NextRequest): TokenPayload {
    const session = requireAuth(request);
    if (session.role !== "superadmin" && session.role !== "admin") {
        throw new Error("Forbidden");
    }
    return session;
}

export { COOKIE_NAME };
