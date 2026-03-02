"use client";

import React, { useState, useEffect } from "react";

interface AlertConfig {
    email: string;
    tempSetpoint: number;
    humSetpoint: number;
    enabled: boolean;
    lastTriggered?: string | null;
}

export default function AlertConfigPanel() {
    const [config, setConfig] = useState<AlertConfig>({
        email: "", tempSetpoint: 40, humSetpoint: 80, enabled: false, lastTriggered: null,
    });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [checkResult, setCheckResult] = useState<{
        triggered: boolean;
        alerts?: Array<{ mac: string; temp: number; ts: string }>;
    } | null>(null);

    useEffect(() => {
        fetch("/api/alerts")
            .then((res) => res.json())
            .then((data) => { if (data.success && data.data) setConfig(data.data); })
            .catch(console.error);
    }, []);

    const saveConfig = async () => {
        setSaving(true); setMessage(null);
        try {
            const res = await fetch("/api/alerts", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            const data = await res.json();
            setMessage(data.success
                ? { text: "Alert configuration saved!", type: "success" }
                : { text: data.error || "Failed to save", type: "error" });
        } catch { setMessage({ text: "Network error", type: "error" }); }
        finally { setSaving(false); setTimeout(() => setMessage(null), 3000); }
    };

    const checkAlerts = async () => {
        try {
            const res = await fetch("/api/alerts/check");
            const data = await res.json();
            setCheckResult(data);
            setMessage(data.triggered
                ? { text: `⚠️ ${data.alertCount} alert(s) triggered! Email sent.`, type: "error" }
                : { text: "✅ All readings within safe range", type: "success" });
            setTimeout(() => setMessage(null), 5000);
        } catch { setMessage({ text: "Failed to check alerts", type: "error" }); }
    };

    return (
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
                    <label>Temperature Setpoint (°C)</label>
                    <div className="slider-row">
                        <input type="range" min="15" max="60" step="0.5"
                            value={config.tempSetpoint}
                            onChange={(e) => setConfig({ ...config, tempSetpoint: Number(e.target.value) })}
                        />
                        <span className="slider-value" style={{ color: "var(--accent-red)" }}>{config.tempSetpoint}°C</span>
                    </div>
                    <div className="slider-hint">Email will be sent when temperature exceeds this value</div>
                </div>

                <div className="form-group">
                    <label>Humidity Setpoint (%)</label>
                    <div className="slider-row humidity">
                        <input type="range" min="20" max="100" step="1"
                            value={config.humSetpoint}
                            onChange={(e) => setConfig({ ...config, humSetpoint: Number(e.target.value) })}
                        />
                        <span className="slider-value" style={{ color: "var(--accent-blue)" }}>{config.humSetpoint}%</span>
                    </div>
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
                                <span style={{ color: "var(--accent-red)" }}>{alert.temp}°C</span>
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

                {config.lastTriggered && (
                    <p className="last-triggered">
                        Last triggered: {new Date(config.lastTriggered).toLocaleString()}
                    </p>
                )}
            </div>
        </div>
    );
}
