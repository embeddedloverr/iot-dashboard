"use client";

import React, { useState, useEffect, useCallback } from "react";

interface HvacRelayState {
    relayMac: string;
    relayChannel: number;
    mode: "manual" | "auto";
    manualState: "ON" | "OFF";
    lastAction: "ON" | "OFF" | null;
    lastExecutedAt: string | null;
}

interface HvacZone {
    _id?: string;
    zoneName: string;
    sensorMac: string;
    pump: HvacRelayState;
    heater: HvacRelayState;
    ac: HvacRelayState;
    tempSetpoint: number;
    tempDeadband: number;
    acTempSetpoint: number;
    acTempDeadband: number;
    humSetpoint: number;
    humDeadband: number;
    cooldownSeconds: number;
    enabled: boolean;
    sensorAlias?: string;
    sensorData?: { temp_c: number; hum_rh: number; ts: string; rssi?: number } | null;
    createdAt?: string;
    updatedAt?: string;
}

interface DeviceInfo { mac: string; alias: string; }
interface HvacPanelProps { devices: DeviceInfo[]; aliases: Record<string, string>; }

const EMPTY_RELAY = (): HvacRelayState => ({ relayMac: "", relayChannel: 1, mode: "manual", manualState: "OFF", lastAction: null, lastExecutedAt: null });
const EMPTY_ZONE = (): HvacZone => ({
    zoneName: "", sensorMac: "",
    pump: EMPTY_RELAY(), heater: EMPTY_RELAY(), ac: EMPTY_RELAY(),
    tempSetpoint: 24, tempDeadband: 1.0,
    acTempSetpoint: 26, acTempDeadband: 1.0,
    humSetpoint: 55, humDeadband: 5.0,
    cooldownSeconds: 60, enabled: true,
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

    const showMsg = (text: string, type: "success" | "error", ms = 4000) => { setMessage({ text, type }); setTimeout(() => setMessage(null), ms); };

    const fetchZones = useCallback(async () => {
        try { const res = await fetch("/api/hvac/config"); const data = await res.json(); if (data.success) setZones(data.data); }
        catch (err) { console.error("Failed to fetch HVAC zones:", err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchZones(); }, [fetchZones]);
    useEffect(() => { const i = setInterval(fetchZones, 15000); return () => clearInterval(i); }, [fetchZones]);

    const openCreate = () => { setEditForm(EMPTY_ZONE()); setShowModal(true); };
    const openEdit = (zone: HvacZone) => {
        setEditForm({
            ...zone,
            pump: { ...(zone.pump || EMPTY_RELAY()) },
            heater: { ...(zone.heater || EMPTY_RELAY()) },
            ac: { ...(zone.ac || EMPTY_RELAY()) },
            acTempSetpoint: zone.acTempSetpoint ?? 26,
            acTempDeadband: zone.acTempDeadband ?? 1.0,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editForm.zoneName.trim()) { showMsg("Zone name is required", "error"); return; }
        if (!editForm.sensorMac) { showMsg("Select a sensor", "error"); return; }
        setSaving(true);
        try {
            const res = await fetch("/api/hvac/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm) });
            const data = await res.json();
            if (data.success) { showMsg(editForm._id ? `✅ "${editForm.zoneName}" updated` : `✅ "${editForm.zoneName}" created`, "success"); setShowModal(false); fetchZones(); }
            else { showMsg(data.error || "Failed to save", "error"); }
        } catch { showMsg("Network error", "error"); } finally { setSaving(false); }
    };

    const handleDelete = async (id: string) => {
        try { const res = await fetch(`/api/hvac/config?id=${id}`, { method: "DELETE" }); const data = await res.json(); if (data.success) { showMsg("✅ Zone deleted", "success"); setConfirmDelete(null); fetchZones(); } else { showMsg(data.error, "error"); } }
        catch { showMsg("Network error", "error"); }
    };

    const handleControl = async (zone: HvacZone, relay: "pump" | "heater" | "ac", action: "ON" | "OFF") => {
        if (!zone._id) return;
        const key = `${zone._id}_${relay}`;
        setControlling(key);
        try {
            const res = await fetch("/api/hvac/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configId: zone._id, relay, action }) });
            const data = await res.json();
            const label = relay === "pump" ? "Pump" : relay === "heater" ? "Heater" : "AC";
            if (data.success) { showMsg(`⚡ ${zone.zoneName}: ${label} ${action}`, "success"); fetchZones(); }
            else { showMsg(data.error || "Control failed", "error"); }
        } catch { showMsg("Network error", "error"); } finally { setControlling(null); }
    };

    const handleToggleEnabled = async (zone: HvacZone) => {
        try { await fetch("/api/hvac/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...zone, enabled: !zone.enabled }) }); fetchZones(); }
        catch { showMsg("Failed to toggle", "error"); }
    };

    const handleModeSwitch = async (zone: HvacZone, relay: "pump" | "heater" | "ac") => {
        const relayData = zone[relay] || EMPTY_RELAY();
        const newMode = relayData.mode === "manual" ? "auto" : "manual";
        const updated = { ...zone, [relay]: { ...relayData, mode: newMode } };
        const label = relay === "pump" ? "Pump" : relay === "heater" ? "Heater" : "AC";
        try { await fetch("/api/hvac/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) }); showMsg(`${zone.zoneName}: ${label} → ${newMode}`, "success"); fetchZones(); }
        catch { showMsg("Failed to switch mode", "error"); }
    };

    const formatDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

    // --- Relay row sub-component ---
    const RelayRow = ({ zone, relay, label, icon, setpoint, deadband, unit, currentVal, statusColor }: {
        zone: HvacZone; relay: "pump" | "heater" | "ac"; label: string; icon: string;
        setpoint: number; deadband: number; unit: string;
        currentVal: number | null; statusColor: string;
    }) => {
        const r = zone[relay] || { relayMac: "", relayChannel: 1, mode: "manual" as const, manualState: "OFF" as const, lastAction: null, lastExecutedAt: null };
        const isOn = r.lastAction === "ON";
        const ctrlKey = `${zone._id}_${relay}`;
        const diff = currentVal !== null ? currentVal - setpoint : null;
        const statusLabel = diff === null ? "No data" : Math.abs(diff) <= deadband ? "On target" : diff > 0 ? `+${diff.toFixed(1)}${unit} above` : `${Math.abs(diff).toFixed(1)}${unit} below`;

        return (
            <div className="hvac-relay-row">
                <div className="hvac-relay-row-header">
                    <div className="hvac-relay-row-title">
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        <div>
                            <strong>{label}</strong>
                            <span className="hvac-relay-mac">📶 {r.relayMac?.slice(-8) || "—"} · Ch{r.relayChannel}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span className={`hvac-mode-badge ${r.mode}`}>
                            {r.mode === "auto" ? "🤖 Auto" : "🔧 Manual"}
                        </span>
                        <button className="hvac-mode-switch-btn" onClick={() => handleModeSwitch(zone, relay)} title={`Switch to ${r.mode === "manual" ? "auto" : "manual"}`}>⇄</button>
                    </div>
                </div>

                <div className="hvac-relay-row-body">
                    {/* Reading + Setpoint */}
                    <div className="hvac-relay-row-reading">
                        <div className="hvac-reading-values">
                            <span className="hvac-current-val" style={{ color: currentVal !== null ? statusColor : "#666", fontSize: 22 }}>
                                {currentVal !== null ? currentVal.toFixed(1) : "--"}
                                <span className="hvac-unit">{unit}</span>
                            </span>
                            <span className="hvac-setpoint-val">
                                🎯 {setpoint}{unit}
                                <span className="hvac-deadband">±{deadband}</span>
                            </span>
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: diff !== null && Math.abs(diff) <= deadband ? "#10b981" : statusColor, marginTop: 2 }}>
                            {statusLabel}
                        </div>
                    </div>

                    {/* Relay Status + Controls */}
                    <div className="hvac-relay-row-controls">
                        <div className={`hvac-relay-indicator ${isOn ? "on" : "off"}`}>
                            <span className="hvac-relay-dot" />
                            <span>{isOn ? "ON" : "OFF"}</span>
                        </div>

                        {r.mode === "manual" ? (
                            <div className="hvac-manual-controls">
                                <button className={`hvac-ctrl-btn hvac-ctrl-on ${isOn ? "active" : ""}`} onClick={() => handleControl(zone, relay, "ON")} disabled={controlling === ctrlKey}>
                                    {controlling === ctrlKey ? "..." : "ON"}
                                </button>
                                <button className={`hvac-ctrl-btn hvac-ctrl-off ${!isOn ? "active" : ""}`} onClick={() => handleControl(zone, relay, "OFF")} disabled={controlling === ctrlKey}>
                                    {controlling === ctrlKey ? "..." : "OFF"}
                                </button>
                            </div>
                        ) : (
                            <div className="hvac-auto-badge">
                                <span className="hvac-auto-pulse" />
                                Automated
                            </div>
                        )}
                    </div>
                </div>

                {r.lastExecutedAt && (
                    <div className="hvac-relay-row-time">Last: {formatDate(r.lastExecutedAt)}</div>
                )}
            </div>
        );
    };

    // --- Modal relay config section ---
    const RelayFormSection = ({ relay, label, icon, borderColor, setpointLabel, setpointIcon, setpointValue, deadbandValue, setpointMin, setpointMax, setpointStep, deadbandMin, deadbandMax, deadbandStep, onSetpointChange, onDeadbandChange }: {
        relay: "pump" | "heater" | "ac"; label: string; icon: string; borderColor: string;
        setpointLabel: string; setpointIcon: string;
        setpointValue: number; deadbandValue: number;
        setpointMin: number; setpointMax: number; setpointStep: number;
        deadbandMin: number; deadbandMax: number; deadbandStep: number;
        onSetpointChange: (v: number) => void; onDeadbandChange: (v: number) => void;
    }) => {
        const relayData = editForm[relay] || EMPTY_RELAY();
        return (
            <div className="relay-form-section" style={{ borderColor }}>
                <div className="relay-form-section-title">{icon} {label}</div>
                <div className="relay-form-grid">
                    <div className="admin-form-group">
                        <label>{label} Relay MAC</label>
                        <input type="text" className="admin-input" placeholder="AA:BB:CC:DD:EE:FF" style={{ fontFamily: "monospace" }} value={relayData.relayMac} onChange={(e) => setEditForm({ ...editForm, [relay]: { ...relayData, relayMac: e.target.value.toUpperCase() } })} />
                    </div>
                    <div className="admin-form-group">
                        <label>Channel</label>
                        <select className="admin-input relay-select" value={relayData.relayChannel} onChange={(e) => setEditForm({ ...editForm, [relay]: { ...relayData, relayChannel: Number(e.target.value) } })}>
                            <option value={1}>Ch 1</option><option value={2}>Ch 2</option><option value={3}>Ch 3</option><option value={4}>Ch 4</option>
                        </select>
                    </div>
                </div>
                <div className="relay-form-grid" style={{ marginTop: 12 }}>
                    <div className="admin-form-group">
                        <label>Mode</label>
                        <div className="hvac-mode-selector">
                            <button className={`hvac-mode-option ${relayData.mode === "manual" ? "active" : ""}`} onClick={() => setEditForm({ ...editForm, [relay]: { ...relayData, mode: "manual" } })}><span>🔧</span><div><strong>Manual</strong></div></button>
                            <button className={`hvac-mode-option ${relayData.mode === "auto" ? "active" : ""}`} onClick={() => setEditForm({ ...editForm, [relay]: { ...relayData, mode: "auto" } })}><span>🤖</span><div><strong>Auto</strong></div></button>
                        </div>
                    </div>
                    <div className="admin-form-group">
                        <label>{setpointIcon} {setpointLabel}</label>
                        <input type="number" className="admin-input" step={setpointStep} min={setpointMin} max={setpointMax} value={setpointValue} onChange={(e) => onSetpointChange(Number(e.target.value))} />
                        <div style={{ marginTop: 6 }}>
                            <label style={{ fontSize: 11 }}>± Dead-band</label>
                            <input type="number" className="admin-input" step={deadbandStep} min={deadbandMin} max={deadbandMax} value={deadbandValue} onChange={(e) => onDeadbandChange(Number(e.target.value))} />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            {/* Header */}
            <div className="hvac-panel-header">
                <div className="hvac-panel-title">
                    <span style={{ fontSize: 28 }}>🏠</span>
                    <div>
                        <h2>HVAC Control</h2>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>Manage Pump (humidity) · Heater (temp) · AC (cooling)</p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="hvac-zone-count">{zones.length} zone{zones.length !== 1 ? "s" : ""}</span>
                    <button className="hvac-btn-primary" onClick={openCreate}>+ Add Zone</button>
                </div>
            </div>

            {message && <div className={`alert-message ${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

            {loading ? (
                <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                    <div className="hvac-spinner" /><p style={{ color: "var(--text-secondary)", marginTop: 12 }}>Loading zones...</p>
                </div>
            ) : zones.length === 0 ? (
                <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No HVAC zones configured</p>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>Create zones with Pump, Heater & AC relay control</p>
                    <button className="hvac-btn-primary" onClick={openCreate}>+ Create First Zone</button>
                </div>
            ) : (
                <div className="hvac-zones-grid">
                    {zones.map((zone) => {
                        const hasData = !!zone.sensorData;
                        return (
                            <div key={zone._id} className={`hvac-zone-card glass-card ${!zone.enabled ? "hvac-disabled" : ""}`}>
                                {/* Card Header */}
                                <div className="hvac-zone-header">
                                    <div className="hvac-zone-identity">
                                        <span className={`status-dot ${zone.enabled ? (hasData ? "online" : "warning") : "offline"}`} />
                                        <div>
                                            <div className="hvac-zone-name">{zone.zoneName}</div>
                                            <div className="hvac-zone-meta">📡 {zone.sensorAlias || zone.sensorMac?.slice(-8)}</div>
                                        </div>
                                    </div>
                                    {hasData && (
                                        <div className="hvac-live-badge">
                                            🌡️ {zone.sensorData!.temp_c.toFixed(1)}°C &nbsp; 💧 {zone.sensorData!.hum_rh.toFixed(1)}%
                                        </div>
                                    )}
                                </div>

                                {/* Heater Relay Row */}
                                <RelayRow
                                    zone={zone} relay="heater" label="Heater" icon="🔥"
                                    setpoint={zone.tempSetpoint} deadband={zone.tempDeadband} unit="°C"
                                    currentVal={hasData ? zone.sensorData!.temp_c : null}
                                    statusColor={hasData ? (zone.sensorData!.temp_c >= 38 ? "#ef4444" : zone.sensorData!.temp_c >= 30 ? "#f59e0b" : "#10b981") : "#666"}
                                />

                                {/* AC Relay Row */}
                                <RelayRow
                                    zone={zone} relay="ac" label="AC" icon="❄️"
                                    setpoint={zone.acTempSetpoint ?? 26} deadband={zone.acTempDeadband ?? 1} unit="°C"
                                    currentVal={hasData ? zone.sensorData!.temp_c : null}
                                    statusColor={hasData ? (zone.sensorData!.temp_c >= 35 ? "#ef4444" : zone.sensorData!.temp_c >= 28 ? "#f59e0b" : "#3b82f6") : "#666"}
                                />

                                {/* Pump Relay Row */}
                                <RelayRow
                                    zone={zone} relay="pump" label="Pump" icon="💧"
                                    setpoint={zone.humSetpoint} deadband={zone.humDeadband} unit="%"
                                    currentVal={hasData ? zone.sensorData!.hum_rh : null}
                                    statusColor={hasData ? (zone.sensorData!.hum_rh >= 80 ? "#ef4444" : zone.sensorData!.hum_rh >= 65 ? "#f59e0b" : "#3b82f6") : "#666"}
                                />

                                {/* Footer */}
                                <div className="hvac-zone-footer">
                                    <div className="hvac-zone-footer-info">
                                        <span>⏱ {zone.cooldownSeconds}s cooldown</span>
                                    </div>
                                    <div className="hvac-zone-actions">
                                        <button className="relay-btn-icon" onClick={() => handleToggleEnabled(zone)} title={zone.enabled ? "Disable" : "Enable"}>{zone.enabled ? "⏸" : "▶️"}</button>
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
                            {/* Zone Info */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">📝 Zone Info</div>
                                <div className="relay-form-grid">
                                    <div className="admin-form-group">
                                        <label>Zone Name</label>
                                        <input type="text" className="admin-input" placeholder="e.g. Server Room" value={editForm.zoneName} onChange={(e) => setEditForm({ ...editForm, zoneName: e.target.value })} />
                                    </div>
                                    <div className="admin-form-group">
                                        <label>📡 Source Sensor</label>
                                        <select className="admin-input relay-select" value={editForm.sensorMac} onChange={(e) => setEditForm({ ...editForm, sensorMac: e.target.value })}>
                                            <option value="">— Select a sensor —</option>
                                            {devices.map((d) => (<option key={d.mac} value={d.mac}>{d.alias || d.mac} ({d.mac})</option>))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Heater Config */}
                            <RelayFormSection
                                relay="heater" label="Heater Relay — Temperature Control" icon="🔥"
                                borderColor="rgba(239, 68, 68, 0.2)"
                                setpointLabel="Temp Setpoint (°C)" setpointIcon="🌡️"
                                setpointValue={editForm.tempSetpoint} deadbandValue={editForm.tempDeadband}
                                setpointMin={10} setpointMax={45} setpointStep={0.5}
                                deadbandMin={0.5} deadbandMax={5} deadbandStep={0.5}
                                onSetpointChange={(v) => setEditForm({ ...editForm, tempSetpoint: v })}
                                onDeadbandChange={(v) => setEditForm({ ...editForm, tempDeadband: v })}
                            />

                            {/* AC Config */}
                            <RelayFormSection
                                relay="ac" label="AC Relay — Cooling Control" icon="❄️"
                                borderColor="rgba(56, 189, 248, 0.25)"
                                setpointLabel="AC Setpoint (°C)" setpointIcon="❄️"
                                setpointValue={editForm.acTempSetpoint} deadbandValue={editForm.acTempDeadband}
                                setpointMin={16} setpointMax={32} setpointStep={0.5}
                                deadbandMin={0.5} deadbandMax={5} deadbandStep={0.5}
                                onSetpointChange={(v) => setEditForm({ ...editForm, acTempSetpoint: v })}
                                onDeadbandChange={(v) => setEditForm({ ...editForm, acTempDeadband: v })}
                            />

                            {/* Pump Config */}
                            <RelayFormSection
                                relay="pump" label="Pump Relay — Humidity Control" icon="💧"
                                borderColor="rgba(59, 130, 246, 0.2)"
                                setpointLabel="Humidity Setpoint (%)" setpointIcon="💧"
                                setpointValue={editForm.humSetpoint} deadbandValue={editForm.humDeadband}
                                setpointMin={20} setpointMax={90} setpointStep={1}
                                deadbandMin={1} deadbandMax={15} deadbandStep={1}
                                onSetpointChange={(v) => setEditForm({ ...editForm, humSetpoint: v })}
                                onDeadbandChange={(v) => setEditForm({ ...editForm, humDeadband: v })}
                            />

                            {/* Advanced */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">⚙️ Advanced</div>
                                <div className="relay-form-row">
                                    <div className="admin-form-group" style={{ flex: 1 }}>
                                        <label>⏱ Cooldown (seconds)</label>
                                        <input type="number" className="admin-input" min={10} max={3600} value={editForm.cooldownSeconds} onChange={(e) => setEditForm({ ...editForm, cooldownSeconds: Number(e.target.value) })} />
                                    </div>
                                    <div className="admin-form-group" style={{ flex: 1 }}>
                                        <label>Enable Zone</label>
                                        <button onClick={() => setEditForm({ ...editForm, enabled: !editForm.enabled })} className={`toggle-switch ${editForm.enabled ? "active" : ""}`} style={{ marginTop: 4 }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="admin-save-btn" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "💾 Save Zone"}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
