"use client";

import React, { useState, useEffect, useCallback } from "react";

interface AlertConfig {
    email: string;
    tempSetpoint: number;
    enabled: boolean;
    lastTriggered?: string | null;
}

interface AlertHistoryItem {
    _id: string;
    type: string;
    mac?: string;
    temp?: number;
    setpoint?: number;
    email: string;
    triggeredAt: string;
    sensorTs?: string;
    details: string;
}

export default function AlertConfigPanel() {
    const [config, setConfig] = useState<AlertConfig>({
        email: "", tempSetpoint: 40, enabled: false, lastTriggered: null,
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [history, setHistory] = useState<AlertHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [testSending, setTestSending] = useState(false);
    const [checkResult, setCheckResult] = useState<{
        triggered: boolean;
        alerts?: Array<{ mac: string; temp: number; ts: string }>;
    } | null>(null);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch("/api/alerts/history?limit=30");
            const data = await res.json();
            if (data.success) setHistory(data.data);
        } catch (err) { console.error("Failed to fetch history:", err); }
        finally { setHistoryLoading(false); }
    }, []);

    useEffect(() => {
        fetch("/api/alerts")
            .then((res) => res.json())
            .then((data) => { if (data.success && data.data) setConfig(data.data); })
            .catch(console.error);
        fetchHistory();
    }, [fetchHistory]);

    const showMessage = (text: string, type: "success" | "error", duration = 4000) => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), duration);
    };

    const saveConfig = async () => {
        setSaving(true); setMessage(null);
        try {
            const res = await fetch("/api/alerts", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            const data = await res.json();
            showMessage(data.success ? "✅ Alert configuration saved!" : data.error || "Failed to save", data.success ? "success" : "error");
        } catch { showMessage("Network error", "error"); }
        finally { setSaving(false); }
    };

    const checkAlerts = async () => {
        try {
            const res = await fetch("/api/alerts/check");
            const data = await res.json();
            setCheckResult(data);
            showMessage(
                data.triggered
                    ? `⚠️ ${data.alertCount} alert(s) triggered! Email sent.`
                    : "✅ All readings within safe range",
                data.triggered ? "error" : "success"
            );
            if (data.triggered) fetchHistory();
        } catch { showMessage("Failed to check alerts", "error"); }
    };

    const sendTestEmail = async () => {
        if (!config.email) {
            showMessage("Please enter an email address first", "error");
            return;
        }
        setTestSending(true); setMessage(null);
        try {
            const res = await fetch("/api/alerts/test", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: config.email }),
            });
            const data = await res.json();
            showMessage(
                data.success ? "✅ Test email sent — check your inbox!" : `❌ ${data.error}`,
                data.success ? "success" : "error",
                6000
            );
            if (data.success) fetchHistory();
        } catch { showMessage("Failed to send test email", "error"); }
        finally { setTestSending(false); }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Config Card */}
            <div className="glass-card alert-config">
                <div className="alert-config-header">
                    <div className="alert-config-title">
                        <span className="alert-icon">🔔</span>
                        <h3>Alert Configuration</h3>
                    </div>
                    <button
                        onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                        className={`toggle-switch ${config.enabled ? "active" : ""}`}
                        title={config.enabled ? "Disable alerts" : "Enable alerts"}
                    />
                </div>

                <div className="alert-form">
                    <div className="form-group">
                        <label>Alert Email</label>
                        <input
                            type="email" className="input-field" placeholder="your@email.com"
                            value={config.email} onChange={(e) => setConfig({ ...config, email: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>🌡️ Temperature Setpoint (°C)</label>
                        <div className="slider-row">
                            <input type="range" min="15" max="60" step="0.5"
                                value={config.tempSetpoint}
                                onChange={(e) => setConfig({ ...config, tempSetpoint: Number(e.target.value) })}
                            />
                            <span className="slider-value" style={{ color: "var(--accent-red)" }}>{config.tempSetpoint}°C</span>
                        </div>
                        <div className="slider-hint">Alert email will be sent when any sensor exceeds this temperature</div>
                    </div>

                    {message && (
                        <div className={`alert-message ${message.type}`}>{message.text}</div>
                    )}

                    {checkResult?.triggered && checkResult.alerts && (
                        <div className="active-alerts-box">
                            <p className="alert-title">Active Alerts:</p>
                            {checkResult.alerts.map((alert, i) => (
                                <div key={i} className="alert-row">
                                    <span style={{ fontFamily: "monospace" }}>{alert.mac}</span>
                                    <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>{alert.temp}°C</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="alert-buttons">
                        <button onClick={saveConfig} disabled={saving} className="btn-primary">
                            {saving ? "Saving..." : "💾 Save Config"}
                        </button>
                        <button onClick={checkAlerts} className="btn-secondary">🔍 Check Now</button>
                    </div>

                    <button onClick={sendTestEmail} disabled={testSending} className="btn-test-email">
                        {testSending ? "⏳ Sending..." : "📧 Send Test Email"}
                    </button>

                    {config.lastTriggered && (
                        <p className="last-triggered">
                            Last triggered: {formatDate(config.lastTriggered)}
                        </p>
                    )}
                </div>
            </div>

            {/* Alert History */}
            <div className="glass-card alert-history-card">
                <div className="alert-history-header">
                    <div className="alert-config-title">
                        <span className="alert-icon">📜</span>
                        <h3>Alert History</h3>
                    </div>
                    <span className="device-count-badge">{history.length}</span>
                </div>

                {historyLoading ? (
                    <div className="alert-history-loading">Loading history...</div>
                ) : history.length === 0 ? (
                    <div className="alert-history-empty">
                        <span>📭</span>
                        <p>No alerts triggered yet</p>
                    </div>
                ) : (
                    <div className="alert-history-list">
                        {history.map((item, i) => (
                            <div key={item._id || i} className={`alert-history-item ${item.type === "test" ? "test" : ""}`}>
                                <div className="history-item-left">
                                    <span className="history-type-badge" data-type={item.type}>
                                        {item.type === "test" ? "📧 TEST" : "🚨 ALERT"}
                                    </span>
                                    <div className="history-item-details">
                                        <span className="history-detail-text">{item.details}</span>
                                        {item.mac && (
                                            <span className="history-mac">{item.mac}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="history-item-right">
                                    {item.temp && (
                                        <span className="history-temp">{item.temp}°C</span>
                                    )}
                                    <span className="history-time">{formatDate(item.triggeredAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
