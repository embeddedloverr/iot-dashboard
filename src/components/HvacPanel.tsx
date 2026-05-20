"use client";

import React, { useState, useEffect, useCallback } from "react";

interface HvacZone {
    _id?: string;
    zoneName: string;
    relayMac: string;
    relayChannel: number;
    sensorMac: string;
    mode: "manual" | "auto";
    tempSetpoint: number;
    tempDeadband: number;
    humSetpoint: number;
    humDeadband: number;
    controlField: "temp" | "hum" | "both";
    manualState: "ON" | "OFF";
    cooldownSeconds: number;
    enabled: boolean;
    lastAction?: string | null;
    lastExecutedAt?: string | null;
    sensorAlias?: string;
    relayAlias?: string;
    sensorData?: { temp_c: number; hum_rh: number; ts: string; rssi?: number } | null;
    createdAt?: string;
    updatedAt?: string;
}

interface DeviceInfo { mac: string; alias: string; }
interface HvacPanelProps { devices: DeviceInfo[]; aliases: Record<string, string>; }

const EMPTY_ZONE = (): HvacZone => ({
    zoneName: "", relayMac: "", relayChannel: 1, sensorMac: "",
    mode: "manual", tempSetpoint: 24, tempDeadband: 1.0,
    humSetpoint: 55, humDeadband: 5.0, controlField: "temp",
    manualState: "OFF", cooldownSeconds: 60, enabled: true,
});

export default function HvacPanel({ devices, aliases }: HvacPanelProps) {
    const [zones, setZones] = useState<HvacZone[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editForm, setEditForm] = useState<HvacZone>(EMPTY_ZONE());
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [controlling, setControlling] = useState<string | null>(null);

    const showMsg = (text: string, type: "success" | "error", ms = 4000) => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), ms);
    };

    const fetchZones = useCallback(async () => {
        try {
            const res = await fetch("/api/hvac/config");
            const data = await res.json();
            if (data.success) setZones(data.data);
        } catch (err) { console.error("Failed to fetch HVAC zones:", err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchZones(); }, [fetchZones]);
    useEffect(() => { const i = setInterval(fetchZones, 15000); return () => clearInterval(i); }, [fetchZones]);

    const openCreate = () => { setEditForm(EMPTY_ZONE()); setShowModal(true); };
    const openEdit = (zone: HvacZone) => { setEditForm({ ...zone }); setShowModal(true); };

    const handleSave = async () => {
        if (!editForm.zoneName.trim()) { showMsg("Zone name is required", "error"); return; }
        if (!editForm.relayMac.trim()) { showMsg("Relay MAC is required", "error"); return; }
        if (!editForm.sensorMac) { showMsg("Select a sensor", "error"); return; }
        setSaving(true);
        try {
            const res = await fetch("/api/hvac/config", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(editForm._id ? `✅ "${editForm.zoneName}" updated` : `✅ "${editForm.zoneName}" created`, "success");
                setShowModal(false); fetchZones();
            } else { showMsg(data.error || "Failed to save", "error"); }
        } catch { showMsg("Network error", "error"); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/hvac/config?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) { showMsg("✅ Zone deleted", "success"); setConfirmDelete(null); fetchZones(); }
            else { showMsg(data.error || "Failed to delete", "error"); }
        } catch { showMsg("Network error", "error"); }
    };

    const handleControl = async (zone: HvacZone, action: "ON" | "OFF") => {
        if (!zone._id) return;
        setControlling(zone._id);
        try {
            const res = await fetch("/api/hvac/control", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ configId: zone._id, action }),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(`⚡ ${zone.zoneName}: Relay ${action}`, "success");
                fetchZones();
            } else { showMsg(data.error || "Control failed", "error"); }
        } catch { showMsg("Network error", "error"); }
        finally { setControlling(null); }
    };

    const handleToggleEnabled = async (zone: HvacZone) => {
        try {
            await fetch("/api/hvac/config", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...zone, enabled: !zone.enabled }),
            });
            fetchZones();
        } catch { showMsg("Failed to toggle", "error"); }
    };

    const handleModeSwitch = async (zone: HvacZone) => {
        const newMode = zone.mode === "manual" ? "auto" : "manual";
        try {
            await fetch("/api/hvac/config", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...zone, mode: newMode }),
            });
            showMsg(`${zone.zoneName}: Switched to ${newMode} mode`, "success");
            fetchZones();
        } catch { showMsg("Failed to switch mode", "error"); }
    };

    const getDeviceName = (mac: string) => aliases[mac] || mac?.slice(-8) || "Unknown";
    const formatDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

    const getTempStatus = (zone: HvacZone) => {
        if (!zone.sensorData) return { color: "#666", label: "No data" };
        const diff = zone.sensorData.temp_c - zone.tempSetpoint;
        if (Math.abs(diff) <= zone.tempDeadband) return { color: "#10b981", label: "On target" };
        if (diff > 0) return { color: "#ef4444", label: `+${diff.toFixed(1)}°C above` };
        return { color: "#3b82f6", label: `${Math.abs(diff).toFixed(1)}°C below` };
    };

    const getHumStatus = (zone: HvacZone) => {
        if (!zone.sensorData) return { color: "#666", label: "No data" };
        const diff = zone.sensorData.hum_rh - zone.humSetpoint;
        if (Math.abs(diff) <= zone.humDeadband) return { color: "#10b981", label: "On target" };
        if (diff > 0) return { color: "#f59e0b", label: `+${diff.toFixed(1)}% above` };
        return { color: "#3b82f6", label: `${Math.abs(diff).toFixed(1)}% below` };
    };

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            {/* Header */}
            <div className="hvac-panel-header">
                <div className="hvac-panel-title">
                    <span style={{ fontSize: 28 }}>🏠</span>
                    <div>
                        <h2>HVAC Control</h2>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            Manage HVAC zones, setpoints & relay control
                        </p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="hvac-zone-count">{zones.length} zone{zones.length !== 1 ? "s" : ""}</span>
                    <button className="hvac-btn-primary" onClick={openCreate}>+ Add Zone</button>
                </div>
            </div>

            {message && <div className={`alert-message ${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

            {/* Zone Cards */}
            {loading ? (
                <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                    <div className="hvac-spinner" />
                    <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>Loading HVAC zones...</p>
                </div>
            ) : zones.length === 0 ? (
                <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No HVAC zones configured</p>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
                        Create zones to control HVAC units with temperature & humidity setpoints
                    </p>
                    <button className="hvac-btn-primary" onClick={openCreate}>+ Create First Zone</button>
                </div>
            ) : (
                <div className="hvac-zones-grid">
                    {zones.map((zone) => {
                        const tempSt = getTempStatus(zone);
                        const humSt = getHumStatus(zone);
                        const isOn = zone.lastAction === "ON";
                        const hasData = !!zone.sensorData;

                        return (
                            <div key={zone._id} className={`hvac-zone-card glass-card ${!zone.enabled ? "hvac-disabled" : ""}`}>
                                {/* Card Header */}
                                <div className="hvac-zone-header">
                                    <div className="hvac-zone-identity">
                                        <span className={`status-dot ${zone.enabled ? (hasData ? "online" : "warning") : "offline"}`} />
                                        <div>
                                            <div className="hvac-zone-name">{zone.zoneName}</div>
                                            <div className="hvac-zone-meta">
                                                📡 {zone.sensorAlias || getDeviceName(zone.sensorMac)}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                        <span className={`hvac-mode-badge ${zone.mode}`}>
                                            {zone.mode === "auto" ? "🤖 Auto" : "🔧 Manual"}
                                        </span>
                                        <button className="hvac-mode-switch-btn" onClick={() => handleModeSwitch(zone)} title={`Switch to ${zone.mode === "manual" ? "auto" : "manual"}`}>
                                            ⇄
                                        </button>
                                    </div>
                                </div>

                                {/* Sensor Readings */}
                                <div className="hvac-readings">
                                    <div className="hvac-reading-item">
                                        <div className="hvac-reading-header">
                                            <span>🌡️ Temperature</span>
                                            <span className="hvac-reading-status" style={{ color: tempSt.color }}>{tempSt.label}</span>
                                        </div>
                                        <div className="hvac-reading-values">
                                            <span className="hvac-current-val" style={{ color: hasData ? (zone.sensorData!.temp_c >= 38 ? "#ef4444" : zone.sensorData!.temp_c >= 30 ? "#f59e0b" : "#10b981") : "#666" }}>
                                                {hasData ? zone.sensorData!.temp_c.toFixed(1) : "--"}
                                                <span className="hvac-unit">°C</span>
                                            </span>
                                            <span className="hvac-setpoint-val">
                                                🎯 {zone.tempSetpoint}°C
                                                {zone.mode === "auto" && <span className="hvac-deadband">±{zone.tempDeadband}</span>}
                                            </span>
                                        </div>
                                        <div className="hvac-progress-bar">
                                            <div className="hvac-progress-fill" style={{
                                                width: hasData ? `${Math.min((zone.sensorData!.temp_c / 50) * 100, 100)}%` : "0%",
                                                background: `linear-gradient(90deg, #10b981, #f59e0b, #ef4444)`,
                                                opacity: zone.enabled ? 1 : 0.3,
                                            }} />
                                            {zone.mode === "auto" && (
                                                <div className="hvac-setpoint-marker" style={{ left: `${(zone.tempSetpoint / 50) * 100}%` }} />
                                            )}
                                        </div>
                                    </div>

                                    <div className="hvac-reading-divider" />

                                    <div className="hvac-reading-item">
                                        <div className="hvac-reading-header">
                                            <span>💧 Humidity</span>
                                            <span className="hvac-reading-status" style={{ color: humSt.color }}>{humSt.label}</span>
                                        </div>
                                        <div className="hvac-reading-values">
                                            <span className="hvac-current-val" style={{ color: hasData ? (zone.sensorData!.hum_rh >= 80 ? "#ef4444" : zone.sensorData!.hum_rh >= 65 ? "#f59e0b" : "#3b82f6") : "#666" }}>
                                                {hasData ? zone.sensorData!.hum_rh.toFixed(1) : "--"}
                                                <span className="hvac-unit">%</span>
                                            </span>
                                            <span className="hvac-setpoint-val">
                                                🎯 {zone.humSetpoint}%
                                                {zone.mode === "auto" && <span className="hvac-deadband">±{zone.humDeadband}</span>}
                                            </span>
                                        </div>
                                        <div className="hvac-progress-bar">
                                            <div className="hvac-progress-fill" style={{
                                                width: hasData ? `${Math.min(zone.sensorData!.hum_rh, 100)}%` : "0%",
                                                background: `linear-gradient(90deg, #3b82f6, #06b6d4)`,
                                                opacity: zone.enabled ? 1 : 0.3,
                                            }} />
                                            {zone.mode === "auto" && (
                                                <div className="hvac-setpoint-marker" style={{ left: `${zone.humSetpoint}%` }} />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Relay Status & Controls */}
                                <div className="hvac-relay-section">
                                    <div className="hvac-relay-status">
                                        <div className={`hvac-relay-indicator ${isOn ? "on" : "off"}`}>
                                            <span className="hvac-relay-dot" />
                                            <span>Relay {isOn ? "ON" : "OFF"}</span>
                                        </div>
                                        <div className="hvac-relay-info">
                                            <span className="hvac-relay-mac">📶 {zone.relayMac?.slice(-8)} · Ch{zone.relayChannel}</span>
                                            {zone.lastExecutedAt && (
                                                <span className="hvac-relay-time">{formatDate(zone.lastExecutedAt)}</span>
                                            )}
                                        </div>
                                    </div>

                                    {zone.mode === "manual" ? (
                                        <div className="hvac-manual-controls">
                                            <button
                                                className={`hvac-ctrl-btn hvac-ctrl-on ${isOn ? "active" : ""}`}
                                                onClick={() => handleControl(zone, "ON")}
                                                disabled={controlling === zone._id}
                                            >
                                                {controlling === zone._id ? "..." : "ON"}
                                            </button>
                                            <button
                                                className={`hvac-ctrl-btn hvac-ctrl-off ${!isOn ? "active" : ""}`}
                                                onClick={() => handleControl(zone, "OFF")}
                                                disabled={controlling === zone._id}
                                            >
                                                {controlling === zone._id ? "..." : "OFF"}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="hvac-auto-badge">
                                            <span className="hvac-auto-pulse" />
                                            Automated
                                        </div>
                                    )}
                                </div>

                                {/* Card Footer */}
                                <div className="hvac-zone-footer">
                                    <div className="hvac-zone-footer-info">
                                        <span>⏱ {zone.cooldownSeconds}s cooldown</span>
                                        <span>{zone.controlField === "both" ? "Temp+Hum" : zone.controlField === "temp" ? "Temp" : "Humidity"}</span>
                                    </div>
                                    <div className="hvac-zone-actions">
                                        <button className="relay-btn-icon" onClick={() => handleToggleEnabled(zone)} title={zone.enabled ? "Disable" : "Enable"}>
                                            {zone.enabled ? "⏸" : "▶️"}
                                        </button>
                                        <button className="relay-btn-icon" onClick={() => openEdit(zone)} title="Edit">✏️</button>
                                        {confirmDelete === zone._id ? (
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <button className="relay-btn-danger-sm" onClick={() => handleDelete(zone._id!)}>Delete</button>
                                                <button className="relay-btn-cancel-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                            </div>
                                        ) : (
                                            <button className="relay-btn-icon relay-btn-icon-danger" onClick={() => setConfirmDelete(zone._id!)} title="Delete">🗑️</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ========== CREATE / EDIT MODAL ========== */}
            {showModal && (
                <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="admin-modal hvac-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h3>{editForm._id ? `✏️ Edit: ${editForm.zoneName}` : "🏠 New HVAC Zone"}</h3>
                            <button className="admin-modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <div className="admin-modal-body relay-modal-body">
                            {/* Basic Info */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">📝 Zone Info</div>
                                <div className="relay-form-grid">
                                    <div className="admin-form-group">
                                        <label>Zone Name</label>
                                        <input type="text" className="admin-input" placeholder="e.g. Server Room"
                                            value={editForm.zoneName}
                                            onChange={(e) => setEditForm({ ...editForm, zoneName: e.target.value })}
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label>🔌 Relay MAC Address</label>
                                        <input type="text" className="admin-input" placeholder="e.g. AA:BB:CC:DD:EE:FF"
                                            value={editForm.relayMac} style={{ fontFamily: "monospace" }}
                                            onChange={(e) => setEditForm({ ...editForm, relayMac: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                </div>

                                <div className="relay-form-grid" style={{ marginTop: 12 }}>
                                    <div className="admin-form-group">
                                        <label>📡 Source Sensor</label>
                                        <select className="admin-input relay-select" value={editForm.sensorMac}
                                            onChange={(e) => setEditForm({ ...editForm, sensorMac: e.target.value })}
                                        >
                                            <option value="">— Select a sensor —</option>
                                            {devices.map((d) => (
                                                <option key={d.mac} value={d.mac}>{d.alias || d.mac} ({d.mac})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="admin-form-group">
                                        <label>Relay Channel</label>
                                        <select className="admin-input relay-select" value={editForm.relayChannel}
                                            onChange={(e) => setEditForm({ ...editForm, relayChannel: Number(e.target.value) })}
                                        >
                                            <option value={1}>Channel 1</option>
                                            <option value={2}>Channel 2</option>
                                            <option value={3}>Channel 3</option>
                                            <option value={4}>Channel 4</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Control Mode */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">🎛️ Control Mode</div>
                                <div className="hvac-mode-selector">
                                    <button className={`hvac-mode-option ${editForm.mode === "manual" ? "active" : ""}`}
                                        onClick={() => setEditForm({ ...editForm, mode: "manual" })}
                                    >
                                        <span style={{ fontSize: 20 }}>🔧</span>
                                        <div>
                                            <strong>Manual</strong>
                                            <p>Direct ON/OFF control</p>
                                        </div>
                                    </button>
                                    <button className={`hvac-mode-option ${editForm.mode === "auto" ? "active" : ""}`}
                                        onClick={() => setEditForm({ ...editForm, mode: "auto" })}
                                    >
                                        <span style={{ fontSize: 20 }}>🤖</span>
                                        <div>
                                            <strong>Automatic</strong>
                                            <p>Setpoint-based control</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Setpoints — shown in auto mode */}
                            {editForm.mode === "auto" && (
                                <div className="relay-form-section">
                                    <div className="relay-form-section-title">🎯 Setpoints & Dead-band</div>

                                    <div className="admin-form-group" style={{ marginBottom: 14 }}>
                                        <label>Control Based On</label>
                                        <select className="admin-input relay-select" value={editForm.controlField}
                                            onChange={(e) => setEditForm({ ...editForm, controlField: e.target.value as "temp" | "hum" | "both" })}
                                        >
                                            <option value="temp">🌡️ Temperature Only</option>
                                            <option value="hum">💧 Humidity Only</option>
                                            <option value="both">🌡️💧 Both (Temp priority)</option>
                                        </select>
                                    </div>

                                    <div className="relay-form-grid">
                                        <div className="admin-form-group">
                                            <label>🌡️ Temp Setpoint (°C)</label>
                                            <input type="number" className="admin-input" step={0.5} min={10} max={45}
                                                value={editForm.tempSetpoint}
                                                onChange={(e) => setEditForm({ ...editForm, tempSetpoint: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="admin-form-group">
                                            <label>± Dead-band (°C)</label>
                                            <input type="number" className="admin-input" step={0.5} min={0.5} max={5}
                                                value={editForm.tempDeadband}
                                                onChange={(e) => setEditForm({ ...editForm, tempDeadband: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                    <div className="relay-form-grid" style={{ marginTop: 12 }}>
                                        <div className="admin-form-group">
                                            <label>💧 Humidity Setpoint (%)</label>
                                            <input type="number" className="admin-input" step={1} min={20} max={90}
                                                value={editForm.humSetpoint}
                                                onChange={(e) => setEditForm({ ...editForm, humSetpoint: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="admin-form-group">
                                            <label>± Dead-band (%)</label>
                                            <input type="number" className="admin-input" step={1} min={1} max={15}
                                                value={editForm.humDeadband}
                                                onChange={(e) => setEditForm({ ...editForm, humDeadband: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ padding: "10px 12px", background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: 8, fontSize: 11, color: "var(--text-secondary)", marginTop: 12 }}>
                                        💡 <strong>Dead-band</strong>: Relay turns ON when reading exceeds setpoint + dead-band, and OFF when it drops below setpoint − dead-band. This prevents rapid cycling.
                                    </div>
                                </div>
                            )}

                            {/* Advanced */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">⚙️ Advanced</div>
                                <div className="relay-form-row">
                                    <div className="admin-form-group" style={{ flex: 1 }}>
                                        <label>⏱ Cooldown (seconds)</label>
                                        <input type="number" className="admin-input" min={10} max={3600}
                                            value={editForm.cooldownSeconds}
                                            onChange={(e) => setEditForm({ ...editForm, cooldownSeconds: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="admin-form-group" style={{ flex: 1 }}>
                                        <label>Enable Zone</label>
                                        <button onClick={() => setEditForm({ ...editForm, enabled: !editForm.enabled })}
                                            className={`toggle-switch ${editForm.enabled ? "active" : ""}`}
                                            style={{ marginTop: 4 }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="admin-save-btn" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : "💾 Save Zone"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
