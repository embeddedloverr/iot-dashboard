import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendAlertEmail } from "@/lib/mailer";

// POST: Send a test email
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email } = body;

        if (!email) {
            return NextResponse.json(
                { success: false, error: "Email address is required" },
                { status: 400 }
            );
        }

        const html = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a0a1a; color: #e8e8ff; border-radius: 16px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #4f7df5, #8b5cf6); padding: 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 20px; color: white;">🌡️ SmartDwell IoT Monitor</h1>
                <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Test Email</p>
            </div>
            <div style="padding: 24px;">
                <p style="font-size: 15px; line-height: 1.6;">✅ This is a test email from your SmartDwell IoT Dashboard.</p>
                <p style="font-size: 14px; color: #8888bb; line-height: 1.6;">
                    Your email alert system is configured correctly. When a sensor exceeds the temperature setpoint, 
                    alert emails will be sent to this address.
                </p>
                <div style="margin-top: 20px; padding: 12px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px; color: #10b981;">📧 Email delivery is working!</p>
                </div>
                <p style="margin-top: 20px; font-size: 12px; color: #8888bb;">
                    Sent at: ${new Date().toLocaleString()}
                </p>
            </div>
            <div style="padding: 16px; text-align: center; border-top: 1px solid rgba(255,255,255,0.08);">
                <p style="margin: 0; font-size: 11px; color: #8888bb;">Smartdwell Technologies · IoT Monitoring Dashboard</p>
            </div>
        </div>`;

        await sendAlertEmail(email, "🌡️ SmartDwell IoT — Test Email", html);

        // Log to alert_history
        const db = await getDb();
        await db.collection("alert_history").insertOne({
            type: "test",
            email,
            subject: "Test Email",
            triggeredAt: new Date(),
            details: "Manual test email sent successfully",
        });

        return NextResponse.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
        console.error("Error sending test email:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { success: false, error: `Failed to send test email: ${errorMsg}` },
            { status: 500 }
        );
    }
}
