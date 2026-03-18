"use client";

import React, { useState, useEffect, useCallback } from "react";

interface DeviceAlertConfig {
    tempSetpoint: number;
    enabled: boolean;
    emails: string[];
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
    const [deviceConfigs, setDeviceConfigs] = useState<Record<string, DeviceAlertConfig>>({});
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [history, setHistory] = useState<AlertHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [testSending, setTestSending] = useState(false);
    const [editingAlias, setEditingAlias] = useState<string | null>(null);
    const [aliasInput, setAliasInput] = useState("");
    const [activeTab, setActiveTab] = useState<"devices" | "history">("devices");

    // Bulk config state
    const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkConfig, setBulkConfig] = useState<DeviceAlertConfig>({
        tempSetpoint: 40, enabled: true, emails: [""],
    });

    // Single device config modal
    const [editingDevice, setEditingDevice] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<DeviceAlertConfig>({
        tempSetpoint: 40, enabled: true, emails: [""],
    });

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
            const res = await fetch("/api/alerts/devices");
            const data = await res.json();
            if (data.success) setDeviceConfigs(data.data.devices || {});
        } catch (err) { console.error("Failed to fetch configs:", err); }
    }, []);

    useEffect(() => {
        fetchAlertConfigs(); fetchHistory();
        // Trigger immediate alert check on page load
        fetch("/api/alerts/check").catch(console.error);
    }, [fetchAlertConfigs, fetchHistory]);

    const showMsg = (text: string, type: "success" | "error", ms = 4000) => {
        setMessage({ text, type }); setTimeout(() => setMessage(null), ms);
    };

    const saveDeviceConfig = async (mac: string, cfg: DeviceAlertConfig) => {
        try {
            const validEmails = cfg.emails.filter(e => e.trim() !== "");
            const res = await fetch("/api/alerts/devices", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mac, tempSetpoint: cfg.tempSetpoint, enabled: cfg.enabled, emails: validEmails }),
            });
            const data = await res.json();
            if (data.success) {
                setDeviceConfigs(prev => ({ ...prev, [mac]: { ...cfg, emails: validEmails } }));
                // Trigger immediate alert check after config save
                fetch("/api/alerts/check").catch(console.error);
            }
            return data.success;
        } catch { return false; }
    };

    const removeDeviceConfig = async (mac: string) => {
        try {
            await fetch(`/api/alerts/devices?mac=${mac}`, { method: "DELETE" });
            const updated = { ...deviceConfigs };
            delete updated[mac];
            setDeviceConfigs(updated);
            showMsg(`Removed config for ${aliases[mac] || mac}`, "success");
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

    const sendTestEmail = async (emails: string[]) => {
        const validEmails = emails.filter(e => e.trim() !== "");
        if (validEmails.length === 0) { showMsg("Enter at least one email first", "error"); return; }
        setTestSending(true);
        try {
            const res = await fetch("/api/alerts/test", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emails: validEmails }),
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
                data.triggered ? `⚠️ ${(data.tempAlerts || 0) + (data.offlineAlerts || 0)} alert(s) triggered!` : "✅ All devices within range",
                data.triggered ? "error" : "success"
            );
            if (data.triggered) fetchHistory();
        } catch { showMsg("Failed to check", "error"); }
    };

    const formatDate = (s: string) => new Date(s).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const getDeviceName = (mac: string) => aliases[mac] || mac?.slice(-8) || "Unknown";

    // --- Single device edit ---
    const openDeviceEdit = (mac: string) => {
        const cfg = deviceConfigs[mac] || { tempSetpoint: 40, enabled: true, emails: [""] };
        setEditForm({ ...cfg, emails: cfg.emails.length > 0 ? [...cfg.emails] : [""] });
        setEditingDevice(mac);
    };

    const handleSingleSave = async () => {
        if (!editingDevice) return;
        setSaving(true);
        const ok = await saveDeviceConfig(editingDevice, editForm);
        setSaving(false);
        if (ok) {
            showMsg(`✅ Alert saved for ${getDeviceName(editingDevice)}`, "success");
            setEditingDevice(null);
        } else {
            showMsg("Failed to save", "error");
        }
    };

    // --- Bulk operations ---
    const toggleSelected = (mac: string) => {
        setSelectedDevices(prev => prev.includes(mac) ? prev.filter(m => m !== mac) : [...prev, mac]);
    };

    const selectAll = () => {
        setSelectedDevices(prev => prev.length === devices.length ? [] : devices.map(d => d.mac));
    };

    const openBulkModal = () => {
        if (selectedDevices.length === 0) { showMsg("Select devices first", "error"); return; }
        setBulkConfig({ tempSetpoint: 40, enabled: true, emails: [""] });
        setShowBulkModal(true);
    };

    const handleBulkSave = async () => {
        setSaving(true);
        let successCount = 0;
        for (const mac of selectedDevices) {
            const ok = await saveDeviceConfig(mac, bulkConfig);
            if (ok) successCount++;
        }
        setSaving(false);
        showMsg(`✅ Alert config applied to ${successCount}/${selectedDevices.length} device(s)`, "success");
        setShowBulkModal(false);
        setSelectedDevices([]);
    };

    // Helper for email list editing
    const EmailListEditor = ({ emails, onChange }: { emails: string[]; onChange: (emails: string[]) => void }) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {emails.map((email, idx) => (
                <div key={idx} style={{ display: "flex", gap: "8px" }}>
                    <input type="email" className="input-field" placeholder="recipient@email.com"
                        value={email} onChange={(e) => {
                            const newEmails = [...emails];
                            newEmails[idx] = e.target.value;
                            onChange(newEmails);
                        }}
                        style={{ flex: 1 }}
                    />
                    {emails.length > 1 && (
                        <button
                            style={{ padding: "0 12px", background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
                            onClick={() => onChange(emails.filter((_, i) => i !== idx))}
                        >✕</button>
                    )}
                </div>
            ))}
            <button
                style={{ padding: "8px 14px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "8px", cursor: "pointer", fontSize: "12px", alignSelf: "flex-start" }}
                onClick={() => onChange([...emails, ""])}
            >+ Add Email</button>
        </div>
    );

    const configuredCount = Object.keys(deviceConfigs).length;

    return (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
            {/* Tab Navigation */}
            <div className="alert-tabs">
                <button className={`alert-tab ${activeTab === "devices" ? "active" : ""}`} onClick={() => setActiveTab("devices")}>
                    📡 Devices ({devices.length})
                </button>
                <button className={`alert-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}>
                    📜 History ({history.length})
                </button>
            </div>

            {message && <div className={`alert-message ${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

            {/* TAB: Device Alert Settings */}
            {activeTab === "devices" && (
                <div>
                    {/* Toolbar */}
                    <div className="glass-card" style={{ padding: "16px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                            <button onClick={selectAll} className="btn-secondary" style={{ fontSize: 12, padding: "6px 14px" }}>
                                {selectedDevices.length === devices.length ? "☐ Deselect All" : "☑ Select All"}
                            </button>
                            <button onClick={openBulkModal} className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}
                                disabled={selectedDevices.length === 0}>
                                ⚡ Bulk Configure ({selectedDevices.length})
                            </button>
                            <button onClick={checkAlerts} className="btn-secondary" style={{ fontSize: 12, padding: "6px 14px" }}>
                                🔍 Check Now
                            </button>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {configuredCount}/{devices.length} configured
                        </div>
                    </div>

                    {/* Device Cards */}
                    {devices.length === 0 ? (
                        <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
                            <p style={{ color: "var(--text-secondary)" }}>No devices found yet</p>
                        </div>
                    ) : (
                        <div className="device-config-list">
                            {devices.map((device) => {
                                const mac = device.mac;
                                const alias = aliases[mac] || "";
                                const hasConfig = mac in deviceConfigs;
                                const cfg = deviceConfigs[mac] || { tempSetpoint: 40, enabled: false, emails: [] };
                                const isSelected = selectedDevices.includes(mac);

                                return (
                                    <div key={mac} className={`device-config-item glass-card ${isSelected ? "selected-device" : ""}`}
                                        style={isSelected ? { borderColor: "rgba(99,102,241,0.5)", boxShadow: "0 0 0 1px rgba(99,102,241,0.3)" } : {}}>
                                        {/* Device Header */}
                                        <div className="device-config-header">
                                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(mac)}
                                                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#6366f1" }} />
                                                <div className="device-config-identity">
                                                    <span className={`status-dot ${hasConfig && cfg.enabled ? "online" : "offline"}`} />
                                                    <div>
                                                        <div className="device-config-name">{alias || mac?.slice(-8) || "Unknown"}</div>
                                                        <div className="device-config-mac">{mac}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                {hasConfig && <span className="custom-badge" style={{ fontSize: 10 }}>{cfg.enabled ? "🔔 Active" : "🔕 Muted"}</span>}
                                                {hasConfig && cfg.emails.length > 0 && (
                                                    <span style={{ fontSize: 10, padding: "2px 8px", background: "rgba(99,102,241,0.15)", color: "#818cf8", borderRadius: 6 }}>
                                                        📧 {cfg.emails.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Quick info */}
                                        {hasConfig && (
                                            <div style={{ padding: "8px 16px", display: "flex", gap: "16px", fontSize: 12, color: "var(--text-secondary)" }}>
                                                <span>🌡️ Setpoint: <strong style={{ color: "var(--accent-red)" }}>{cfg.tempSetpoint}°C</strong></span>
                                                {cfg.emails.length > 0 && (
                                                    <span>📧 {cfg.emails.slice(0, 2).join(", ")}{cfg.emails.length > 2 ? ` +${cfg.emails.length - 2}` : ""}</span>
                                                )}
                                            </div>
                                        )}

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

                                        {/* Actions */}
                                        <div className="device-config-actions">
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <button className="btn-device-save" onClick={() => openDeviceEdit(mac)}>
                                                    ⚙️ Configure Alert
                                                </button>
                                                {hasConfig && (
                                                    <button className="btn-device-reset" onClick={() => removeDeviceConfig(mac)}>
                                                        ↩️ Remove
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
                                            {item.type === "test" ? "📧 TEST" : item.type === "offline" ? "⚠️ OFFLINE" : "🚨 ALERT"}
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

            {/* Single Device Config Modal */}
            {editingDevice && (
                <div className="admin-modal-overlay" onClick={() => setEditingDevice(null)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="admin-modal-header">
                            <h3>⚙️ Alert Config: {getDeviceName(editingDevice)}</h3>
                            <button className="admin-modal-close" onClick={() => setEditingDevice(null)}>✕</button>
                        </div>
                        <div className="admin-modal-body">
                            <div className="admin-form-group">
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <label>Enable Alerts</label>
                                    <button
                                        onClick={() => setEditForm({ ...editForm, enabled: !editForm.enabled })}
                                        className={`toggle-switch ${editForm.enabled ? "active" : ""}`}
                                    />
                                </div>
                            </div>
                            <div className="admin-form-group">
                                <label>🌡️ Temperature Setpoint (°C)</label>
                                <div className="slider-row">
                                    <input type="range" min="15" max="60" step="0.5" value={editForm.tempSetpoint}
                                        onChange={(e) => setEditForm({ ...editForm, tempSetpoint: Number(e.target.value) })} />
                                    <span className="slider-value" style={{ color: "var(--accent-red)" }}>{editForm.tempSetpoint}°C</span>
                                </div>
                                <div className="slider-hint">Alert triggers when temperature exceeds this value</div>
                            </div>
                            <div className="admin-form-group">
                                <label>📧 Notification Emails</label>
                                <EmailListEditor emails={editForm.emails} onChange={(emails) => setEditForm({ ...editForm, emails })} />
                            </div>
                            <button onClick={() => sendTestEmail(editForm.emails)} disabled={testSending}
                                style={{ width: "100%", padding: "10px", background: "rgba(99,102,241,0.1)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "10px", cursor: "pointer", fontSize: "13px", marginTop: 8 }}>
                                {testSending ? "⏳ Sending..." : "📧 Send Test Email"}
                            </button>
                        </div>
                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setEditingDevice(null)}>Cancel</button>
                            <button className="admin-save-btn" onClick={handleSingleSave} disabled={saving}>
                                {saving ? "Saving..." : "💾 Save Config"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Config Modal */}
            {showBulkModal && (
                <div className="admin-modal-overlay" onClick={() => setShowBulkModal(false)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="admin-modal-header">
                            <h3>⚡ Bulk Configure ({selectedDevices.length} devices)</h3>
                            <button className="admin-modal-close" onClick={() => setShowBulkModal(false)}>✕</button>
                        </div>
                        <div className="admin-modal-body">
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, padding: "10px 14px", background: "rgba(99,102,241,0.08)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.15)" }}>
                                Applying to: {selectedDevices.map(m => getDeviceName(m)).join(", ")}
                            </div>
                            <div className="admin-form-group">
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <label>Enable Alerts</label>
                                    <button
                                        onClick={() => setBulkConfig({ ...bulkConfig, enabled: !bulkConfig.enabled })}
                                        className={`toggle-switch ${bulkConfig.enabled ? "active" : ""}`}
                                    />
                                </div>
                            </div>
                            <div className="admin-form-group">
                                <label>🌡️ Temperature Setpoint (°C)</label>
                                <div className="slider-row">
                                    <input type="range" min="15" max="60" step="0.5" value={bulkConfig.tempSetpoint}
                                        onChange={(e) => setBulkConfig({ ...bulkConfig, tempSetpoint: Number(e.target.value) })} />
                                    <span className="slider-value" style={{ color: "var(--accent-red)" }}>{bulkConfig.tempSetpoint}°C</span>
                                </div>
                            </div>
                            <div className="admin-form-group">
                                <label>📧 Notification Emails</label>
                                <EmailListEditor emails={bulkConfig.emails} onChange={(emails) => setBulkConfig({ ...bulkConfig, emails })} />
                            </div>
                        </div>
                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowBulkModal(false)}>Cancel</button>
                            <button className="admin-save-btn" onClick={handleBulkSave} disabled={saving}>
                                {saving ? "Applying..." : `✅ Apply to ${selectedDevices.length} Device(s)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
