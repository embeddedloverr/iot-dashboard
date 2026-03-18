/**
 * Alert Cron Script
 * Runs independently of the browser to check alert conditions every 30 seconds.
 * 
 * Usage:
 *   node scripts/alert-cron.js
 *   (or via PM2: pm2 start scripts/alert-cron.js --name iot-alert-cron)
 * 
 * Environment:
 *   APP_URL - Base URL of the running Next.js app (default: http://localhost:3000)
 */

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

async function checkAlerts() {
    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    try {
        const res = await fetch(`${APP_URL}/api/alerts/check`);
        const data = await res.json();

        if (data.triggered) {
            console.log(`[${timestamp}] ⚠️  ALERTS TRIGGERED: ${data.tempAlerts || 0} temp, ${data.offlineAlerts || 0} offline`);
            if (data.emailResults) {
                for (const r of data.emailResults) {
                    if (r.status === "sent") {
                        console.log(`  ✅ Email sent for ${r.mac}`);
                    } else if (r.status === "error") {
                        console.log(`  ❌ Email FAILED for ${r.mac}: ${r.error}`);
                    } else if (r.status === "cooldown") {
                        console.log(`  ⏳ Cooldown active for ${r.mac}`);
                    }
                }
            }
        } else {
            console.log(`[${timestamp}] ✅ All OK — ${data.debug?.[0] || "no alerts"}`);
        }
    } catch (err) {
        console.error(`[${timestamp}] ❌ Check failed:`, err.message || err);
    }
}

// Run immediately on start, then every interval
console.log(`🚀 Alert cron started — checking every ${CHECK_INTERVAL_MS / 1000}s against ${APP_URL}`);
checkAlerts();
setInterval(checkAlerts, CHECK_INTERVAL_MS);
