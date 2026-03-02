"use client";

import React, { useState, useEffect, useCallback } from "react";

interface GlobalConfig {
    email: string;
    tempSetpoint: number;
    enabled: boolean;
    lastTriggered?: string | null;
}

interface DeviceAlertConfig {
    tempSetpoint: number;
    enabled: boolean;
}

interface AlertHistoryItem {
    _id: string;
    type: string;
    mac?: string;
    alias?: string;
    temp?: number;
    setpoint?: number;
    email: string;
    triggeredAt: string;
    details: string;
}

interface DeviceInfo {
    mac: string;
    alias: string;
}

interface AlertConfigPanelProps {
    devices: DeviceInfo[];
    aliases: Record<string, string>;
    onAliasUpdate: () => void;
}

export default function AlertConfigPanel({ devices, aliases, onAliasUpdate }: AlertConfigPanelProps) {
    const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
        email: "", tempSetpoint: 40, enabled: false, lastTriggered: null,
    });
    const [deviceConfigs, setDeviceConfigs] = useState<Record<string, DeviceAlertConfig>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [history, setHistory] = useState<AlertHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [testSending, setTestSending] = useState(false);
    const [editingAlias, setEditingAlias] = useState<string | null>(null);
    const [aliasInput, setAliasInput] = useState("");
    const [activeTab, setActiveTab] = useState<"config" | "devices" | "history">("config");

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch("/api/alerts/history?limit=30");
            const data = await res.json();
            if (data.success) setHistory(data.data);
        } catch (err) { console.error("Failed to fetch history:", err); }
        finally { setHistoryLoading(false); }
    }, []);

    const fetchAlertConfigs = useCallback(async () => {
        try {
            // Global config
            const res1 = await fetch("/api/alerts");
            const data1 = await res1.json();
            if (data1.success && data1.data) setGlobalConfig(data1.data);

            // Per-device configs
            const res2 = await fetch("/api/alerts/devices");
            const data2 = await res2.json();
            if (data2.success) setDeviceConfigs(data2.data.devices || {});
        } catch (err) { console.error("Failed to fetch configs:", err); }
    }, []);

    useEffect(() => { fetchAlertConfigs(); fetchHistory(); }, [fetchAlertConfigs, fetchHistory]);

    const showMsg = (text: string, type: "success" | "error", ms = 4000) => {
        setMessage({ text, type }); setTimeout(() => setMessage(null), ms);
    };

    const saveGlobalConfig = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/alerts", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(globalConfig),
            });
            const data = await res.json();
            showMsg(data.success ? "✅ Global config saved!" : data.error, data.success ? "success" : "error");
        } catch { showMsg("Network error", "error"); }
        finally { setSaving(false); }
    };

    const saveDeviceConfig = async (mac: string, cfg: DeviceAlertConfig) => {
        try {
            const res = await fetch("/api/alerts/devices", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mac, ...cfg }),
            });
            const data = await res.json();
            showMsg(data.success ? `✅ Saved for ${aliases[mac] || mac}` : data.error, data.success ? "success" : "error");
        } catch { showMsg("Network error", "error"); }
    };

    const removeDeviceConfig = async (mac: string) => {
        try {
            await fetch(`/api/alerts/devices?mac=${mac}`, { method: "DELETE" });
            const updated = { ...deviceConfigs };
            delete updated[mac];
            setDeviceConfigs(updated);
            showMsg(`Removed custom config for ${aliases[mac] || mac}`, "success");
        } catch { showMsg("Network error", "error"); }
    };

    const saveAlias = async (mac: string) => {
        if (!aliasInput.trim()) return;
        try {
            const res = await fetch("/api/devices/aliases", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mac, alias: aliasInput.trim() }),
            });
            const data = await res.json();
            if (data.success) { onAliasUpdate(); showMsg(`✅ Alias set: "${aliasInput.trim()}"`, "success"); }
        } catch { showMsg("Failed to save alias", "error"); }
        setEditingAlias(null); setAliasInput("");
    };

    const sendTestEmail = async () => {
        if (!globalConfig.email) { showMsg("Enter email first", "error"); return; }
        setTestSending(true);
        try {
            const res = await fetch("/api/alerts/test", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: globalConfig.email }),
            });
            const data = await res.json();
            showMsg(data.success ? "✅ Test email sent!" : `❌ ${data.error}`, data.success ? "success" : "error", 6000);
            if (data.success) fetchHistory();
        } catch { showMsg("Failed to send test email", "error"); }
        finally { setTestSending(false); }
    };

    const checkAlerts = async () => {
        try {
            const res = await fetch("/api/alerts/check");
            const data = await res.json();
            showMsg(
                data.triggered ? `⚠️ ${data.alertCount} alert(s) triggered!` : "✅ All within range",
                data.triggered ? "error" : "success"
            );
            if (data.triggered) fetchHistory();
        } catch { showMsg("Failed to check", "error"); }
    };

    const formatDate = (s: string) => new Date(s).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const getDeviceName = (mac: string) => aliases[mac] || mac.slice(-8);

    return (
        <div style={{ maxWidth: 750, margin: "0 auto" }}>
            {/* Tab Navigation */}
            <div className="alert-tabs">
                <button className={`alert-tab ${activeTab === "config" ? "active" : ""}`} onClick={() => setActiveTab("config")}>
                    ⚙️ Global Config
                </button>
                <button className={`alert-tab ${activeTab === "devices" ? "active" : ""}`} onClick={() => setActiveTab("devices")}>
                    📡 Devices ({devices.length})
                </button>
                <button className={`alert-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
                    📜 History ({history.length})
                </button>
            </div>

            {message && <div className={`alert-message ${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

            {/* TAB: Global Config */}
            {activeTab === "config" && (
                <div className="glass-card alert-config">
                    <div className="alert-config-header">
                        <div className="alert-config-title">
                            <span className="alert-icon">🔔</span>
                            <h3>Global Alert Settings</h3>
                        </div>
                        <button
                            onClick={() => setGlobalConfig({ ...globalConfig, enabled: !globalConfig.enabled })}
                            className={`toggle-switch ${globalConfig.enabled ? "active" : ""}`}
                        />
                    </div>
                    <div className="alert-form">
                        <div className="form-group">
                            <label>Alert Email</label>
                            <input type="email" className="input-field" placeholder="your@email.com"
                                value={globalConfig.email} onChange={(e) => setGlobalConfig({ ...globalConfig, email: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>🌡️ Default Temperature Setpoint (°C)</label>
                            <div className="slider-row">
                                <input type="range" min="15" max="60" step="0.5" value={globalConfig.tempSetpoint}
                                    onChange={(e) => setGlobalConfig({ ...globalConfig, tempSetpoint: Number(e.target.value) })} />
                                <span className="slider-value" style={{ color: "var(--accent-red)" }}>{globalConfig.tempSetpoint}°C</span>
                            </div>
                            <div className="slider-hint">Default setpoint used for devices without custom configuration</div>
                        </div>
                        <div className="alert-buttons">
                            <button onClick={saveGlobalConfig} disabled={saving} className="btn-primary">
                                {saving ? "Saving..." : "💾 Save Config"}
                            </button>
                            <button onClick={checkAlerts} className="btn-secondary">🔍 Check Now</button>
                        </div>
                        <button onClick={sendTestEmail} disabled={testSending} className="btn-test-email">
                            {testSending ? "⏳ Sending..." : "📧 Send Test Email"}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB: Device Settings */}
            {activeTab === "devices" && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <div className="alert-config-title" style={{ marginBottom: 16 }}>
                        <span className="alert-icon">📡</span>
                        <h3>Device Configuration</h3>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
                        Set aliases and custom alert thresholds for each device. Devices without custom config use the global setpoint ({globalConfig.tempSetpoint}°C).
                    </p>
                    {devices.length === 0 ? (
                        <div className="alert-history-empty"><span>📡</span><p>No devices found yet</p></div>
                    ) : (
                        <div className="device-config-list">
                            {devices.map((device) => {
                                const mac = device.mac;
                                const alias = aliases[mac] || "";
                                const hasCustom = mac in deviceConfigs;
                                const cfg = deviceConfigs[mac] || { tempSetpoint: globalConfig.tempSetpoint, enabled: true };

                                return (
                                    <div key={mac} className="device-config-item glass-card">
                                        {/* Device Identity */}
                                        <div className="device-config-header">
                                            <div className="device-config-identity">
                                                <span className="status-dot online" />
                                                <div>
                                                    <div className="device-config-name">
                                                        {alias || mac.slice(-8)}
                                                    </div>
                                                    <div className="device-config-mac">{mac}</div>
                                                </div>
                                            </div>
                                            {hasCustom && <span className="custom-badge">Custom</span>}
                                        </div>

                                        {/* Alias Editor */}
                                        <div className="device-config-row">
                                            <span className="device-config-label">📝 Alias</span>
                                            {editingAlias === mac ? (
                                                <div className="alias-edit-row">
                                                    <input className="input-field alias-input" value={aliasInput} placeholder="e.g. Living Room"
                                                        onChange={(e) => setAliasInput(e.target.value)}
                                                        onKeyDown={(e) => e.key === "Enter" && saveAlias(mac)} />
                                                    <button className="alias-save-btn" onClick={() => saveAlias(mac)}>✓</button>
                                                    <button className="alias-cancel-btn" onClick={() => { setEditingAlias(null); setAliasInput(""); }}>✕</button>
                                                </div>
                                            ) : (
                                                <button className="alias-set-btn" onClick={() => { setEditingAlias(mac); setAliasInput(alias); }}>
                                                    {alias ? `"${alias}" ✏️` : "Set alias →"}
                                                </button>
                                            )}
                                        </div>

                                        {/* Setpoint */}
                                        <div className="device-config-row">
                                            <span className="device-config-label">🌡️ Setpoint</span>
                                            <div className="device-setpoint-row">
                                                <input type="range" min="15" max="60" step="0.5" value={cfg.tempSetpoint}
                                                    onChange={(e) => setDeviceConfigs({
                                                        ...deviceConfigs,
                                                        [mac]: { ...cfg, tempSetpoint: Number(e.target.value) },
                                                    })} />
                                                <span className="slider-value" style={{ color: "var(--accent-red)", fontSize: 14, minWidth: 50 }}>
                                                    {cfg.tempSetpoint}°C
                                                </span>
                                            </div>
                                        </div>

                                        {/* Enable / Actions */}
                                        <div className="device-config-actions">
                                            <label className="device-enable-label">
                                                <button
                                                    onClick={() => setDeviceConfigs({
                                                        ...deviceConfigs,
                                                        [mac]: { ...cfg, enabled: !cfg.enabled },
                                                    })}
                                                    className={`toggle-switch small ${cfg.enabled ? "active" : ""}`}
                                                />
                                                <span>{cfg.enabled ? "Enabled" : "Disabled"}</span>
                                            </label>
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <button className="btn-device-save" onClick={() => saveDeviceConfig(mac, cfg)}>
                                                    💾 Save
                                                </button>
                                                {hasCustom && (
                                                    <button className="btn-device-reset" onClick={() => removeDeviceConfig(mac)}>
                                                        ↩️ Reset
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB: History */}
            {activeTab === "history" && (
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
                        <div className="alert-history-empty"><span>📭</span><p>No alerts triggered yet</p></div>
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
                                                <span className="history-mac">
                                                    {item.alias && item.alias !== item.mac ? `${item.alias} · ` : ""}{item.mac}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="history-item-right">
                                        {item.temp && <span className="history-temp">{item.temp}°C</span>}
                                        <span className="history-time">{formatDate(item.triggeredAt)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
