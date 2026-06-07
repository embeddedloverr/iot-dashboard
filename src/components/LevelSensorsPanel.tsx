"use client";

import React, { useState, useEffect, useCallback } from "react";

interface LevelReading {
    _id: string;
    mac: string;
    node: string;
    Dev_type: string;
    loc: string;
    client: string;
    d1: number;
    d2: number;
    dtime: string;
    received_at: string;
    alias: string;
    t1Ref: number;
    configId: string | null;
    percentage: number | null;
}

interface TankConfig {
    _id: string;
    mac: string;
    node: string;
    alias: string;
    t1Ref: number;
}

interface LevelSensorsPanelProps {
    isAdmin: boolean;
}

export default function LevelSensorsPanel({ isAdmin }: LevelSensorsPanelProps) {
    const [readings, setReadings] = useState<LevelReading[]>([]);
    const [configs, setConfigs] = useState<TankConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingConfig, setEditingConfig] = useState<TankConfig | null>(null);
    const [form, setForm] = useState({ mac: "", node: "", alias: "", t1Ref: "" });
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const showMsg = (text: string, type: "success" | "error") => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchReadings = useCallback(async () => {
        try {
            const res = await fetch("/api/level-sensors/latest");
            const data = await res.json();
            if (data.success) setReadings(data.data);
        } catch (err) {
            console.error("Failed to fetch level readings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchConfigs = useCallback(async () => {
        try {
            const res = await fetch("/api/level-sensors/config");
            const data = await res.json();
            if (data.success) setConfigs(data.data);
        } catch (err) {
            console.error("Failed to fetch level configs:", err);
        }
    }, []);

    useEffect(() => {
        fetchReadings();
        fetchConfigs();
    }, [fetchReadings, fetchConfigs]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const i = setInterval(() => {
            fetchReadings();
        }, 30000);
        return () => clearInterval(i);
    }, [fetchReadings]);

    const openCreate = () => {
        setEditingConfig(null);
        setForm({ mac: "", node: "", alias: "", t1Ref: "" });
        setShowModal(true);
    };

    const openEdit = (cfg: TankConfig) => {
        setEditingConfig(cfg);
        setForm({
            mac: cfg.mac,
            node: cfg.node,
            alias: cfg.alias || "",
            t1Ref: String(cfg.t1Ref),
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.mac.trim()) { showMsg("MAC address is required", "error"); return; }
        if (!form.node.trim()) { showMsg("Node (tank ID) is required", "error"); return; }
        if (!form.t1Ref || Number(form.t1Ref) <= 0) { showMsg("T1 reference value must be positive", "error"); return; }

        setSaving(true);
        try {
            const body: Record<string, string | number> = {
                mac: form.mac.trim(),
                node: form.node.trim(),
                alias: form.alias.trim(),
                t1Ref: Number(form.t1Ref),
            };
            if (editingConfig) body._id = editingConfig._id;

            const res = await fetch("/api/level-sensors/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(
                    editingConfig
                        ? `✅ Tank "${form.node}" config updated`
                        : `✅ Tank "${form.node}" config added`,
                    "success"
                );
                setShowModal(false);
                fetchConfigs();
                fetchReadings();
            } else {
                showMsg(data.error || "Failed to save", "error");
            }
        } catch {
            showMsg("Network error", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/level-sensors/config?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                showMsg("✅ Tank config deleted", "success");
                setConfirmDelete(null);
                fetchConfigs();
                fetchReadings();
            } else {
                showMsg(data.error || "Delete failed", "error");
            }
        } catch {
            showMsg("Network error", "error");
        }
    };

    // Group readings by MAC for display
    const groupedByMac = readings.reduce<Record<string, LevelReading[]>>((acc, r) => {
        const mac = r.mac || "UNKNOWN";
        if (!acc[mac]) acc[mac] = [];
        acc[mac].push(r);
        return acc;
    }, {});

    const getPercentColor = (pct: number | null) => {
        if (pct === null) return "#666";
        if (pct > 50) return "#10b981";
        if (pct > 20) return "#f59e0b";
        return "#ef4444";
    };

    const getPercentLabel = (pct: number | null) => {
        if (pct === null) return "No config";
        if (pct > 75) return "Good";
        if (pct > 50) return "Adequate";
        if (pct > 20) return "Low";
        return "Critical";
    };

    const getTimeSince = (dateStr: string) => {
        if (!dateStr) return "N/A";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const mins = Math.floor((Date.now() - d.getTime()) / 60000);
            if (mins < 1) return "Just now";
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
            return `${Math.floor(hrs / 24)}d ago`;
        } catch {
            return dateStr;
        }
    };

    // SVG circular gauge component
    const TankGauge = ({ percentage, color, size = 100 }: { percentage: number | null; color: string; size?: number }) => {
        const r = (size - 12) / 2;
        const circumference = 2 * Math.PI * r;
        const pct = percentage !== null ? Math.max(0, Math.min(percentage, 100)) : 0;
        const offset = circumference - (pct / 100) * circumference;
        const cx = size / 2;
        const cy = size / 2;

        return (
            <div className="ls-gauge" style={{ width: size, height: size }}>
                <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="8"
                    />
                    <circle
                        cx={cx} cy={cy} r={r}
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${cx} ${cy})`}
                        className="ls-gauge-ring"
                    />
                </svg>
                <div className="ls-gauge-value">
                    <span className="ls-gauge-number" style={{ color }}>
                        {percentage !== null ? `${percentage.toFixed(0)}` : "—"}
                    </span>
                    {percentage !== null && <span className="ls-gauge-unit">%</span>}
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            {/* Header */}
            <div className="ls-panel-header">
                <div className="ls-panel-title">
                    <span style={{ fontSize: 28 }}>🚰</span>
                    <div>
                        <h2>Level Sensors</h2>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            Water tank level monitoring · Live fill percentage
                        </p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="ls-count-badge">
                        {readings.length} tank{readings.length !== 1 ? "s" : ""}
                    </span>
                    {isAdmin && (
                        <button className="ls-btn-primary" onClick={openCreate}>
                            + Add Tank
                        </button>
                    )}
                </div>
            </div>

            {message && (
                <div className={`alert-message ${message.type}`} style={{ marginBottom: 16 }}>
                    {message.text}
                </div>
            )}

            {/* Admin Config Table */}
            {isAdmin && configs.length > 0 && (
                <div className="ls-config-section">
                    <h3 className="ls-config-title">⚙️ Tank Configurations</h3>
                    <div className="ls-config-table-wrap">
                        <table className="ls-config-table">
                            <thead>
                                <tr>
                                    <th>MAC Address</th>
                                    <th>Node</th>
                                    <th>Alias</th>
                                    <th>T1 Ref</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {configs.map((cfg) => (
                                    <tr key={cfg._id}>
                                        <td>
                                            <code className="ls-mac-code">{cfg.mac}</code>
                                        </td>
                                        <td>
                                            <span className="ls-node-badge">{cfg.node}</span>
                                        </td>
                                        <td>{cfg.alias || "—"}</td>
                                        <td>
                                            <span className="ls-t1ref-val">{cfg.t1Ref}</span>
                                        </td>
                                        <td>
                                            <div className="ls-config-actions">
                                                <button className="admin-edit-btn" onClick={() => openEdit(cfg)} title="Edit">✏️</button>
                                                {confirmDelete === cfg._id ? (
                                                    <div className="admin-confirm-delete">
                                                        <button className="admin-confirm-yes" onClick={() => handleDelete(cfg._id)}>Delete</button>
                                                        <button className="admin-confirm-no" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button className="admin-delete-btn" onClick={() => setConfirmDelete(cfg._id)} title="Delete">🗑️</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tank Cards Grid */}
            {loading ? (
                <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                    <div className="hvac-spinner" />
                    <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>Loading level sensors...</p>
                </div>
            ) : readings.length === 0 ? (
                <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🚰</div>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No water sensor data found</p>
                    <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
                        {isAdmin
                            ? "Add tank configurations to start monitoring. Data is read from the watersensordatas collection."
                            : "No water level data available. Contact an admin."}
                    </p>
                    {isAdmin && (
                        <button className="ls-btn-primary" onClick={openCreate}>+ Add First Tank</button>
                    )}
                </div>
            ) : (
                Object.entries(groupedByMac).map(([mac, tanks]) => (
                    <div key={mac} className="ls-mac-group">
                        <div className="ls-mac-group-header">
                            <div className="ls-mac-group-icon">📡</div>
                            <div>
                                <div className="ls-mac-group-mac">{mac}</div>
                                <div className="ls-mac-group-meta">
                                    {tanks[0]?.client || "Unknown Client"} · {tanks[0]?.loc || "Unknown Location"} · {tanks.length} tank{tanks.length !== 1 ? "s" : ""}
                                </div>
                            </div>
                        </div>

                        <div className="ls-tanks-grid">
                            {tanks.map((tank) => {
                                const color = getPercentColor(tank.percentage);
                                const label = getPercentLabel(tank.percentage);
                                const isConfigured = tank.configId !== null;

                                return (
                                    <div key={`${tank.mac}-${tank.node}`} className="ls-tank-card glass-card">
                                        {/* Card header */}
                                        <div className="ls-tank-header">
                                            <div className="ls-tank-identity">
                                                <span className={`ls-status-dot ${isConfigured ? "configured" : "unconfigured"}`} />
                                                <div>
                                                    <div className="ls-tank-name">
                                                        {tank.alias || `Tank ${tank.node}`}
                                                    </div>
                                                    <div className="ls-tank-node">{tank.node}</div>
                                                </div>
                                            </div>
                                            <span
                                                className="ls-status-label"
                                                style={{ color, borderColor: color }}
                                            >
                                                {label}
                                            </span>
                                        </div>

                                        {/* Gauge */}
                                        <div className="ls-tank-gauge-wrap">
                                            <TankGauge percentage={tank.percentage} color={color} size={120} />
                                        </div>

                                        {/* Readings */}
                                        <div className="ls-tank-readings">
                                            <div className="ls-reading-item">
                                                <span className="ls-reading-label">Level (d1)</span>
                                                <span className="ls-reading-value">{tank.d1}</span>
                                            </div>
                                            <div className="ls-reading-sep" />
                                            <div className="ls-reading-item">
                                                <span className="ls-reading-label">d2</span>
                                                <span className="ls-reading-value">{tank.d2}</span>
                                            </div>
                                            {isConfigured && (
                                                <>
                                                    <div className="ls-reading-sep" />
                                                    <div className="ls-reading-item">
                                                        <span className="ls-reading-label">T1 Ref</span>
                                                        <span className="ls-reading-value">{tank.t1Ref}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="ls-tank-footer">
                                            <span className="ls-tank-time">
                                                🕐 {getTimeSince(tank.received_at)}
                                            </span>
                                            {!isConfigured && isAdmin && (
                                                <button
                                                    className="ls-configure-btn"
                                                    onClick={() => {
                                                        setEditingConfig(null);
                                                        setForm({
                                                            mac: tank.mac,
                                                            node: tank.node,
                                                            alias: "",
                                                            t1Ref: "",
                                                        });
                                                        setShowModal(true);
                                                    }}
                                                >
                                                    ⚙️ Configure
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}

            {/* ========== CREATE / EDIT MODAL ========== */}
            {showModal && (
                <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h3>{editingConfig ? `✏️ Edit: ${editingConfig.node} on ${editingConfig.mac.slice(-8)}` : "🚰 Add Tank Configuration"}</h3>
                            <button className="admin-modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <div className="admin-modal-body">
                            <div className="admin-form-group">
                                <label>MAC Address</label>
                                <input
                                    type="text"
                                    className="admin-input"
                                    value={form.mac}
                                    onChange={(e) => setForm({ ...form, mac: e.target.value.toUpperCase() })}
                                    placeholder="e.g. B0:B2:1C:AE:AF:64"
                                    style={{ fontFamily: "monospace" }}
                                    disabled={!!editingConfig}
                                />
                                <p className="ls-form-hint">
                                    The MAC address of the water sensor device
                                </p>
                            </div>

                            <div className="admin-form-group">
                                <label>Node (Tank ID)</label>
                                <input
                                    type="text"
                                    className="admin-input"
                                    value={form.node}
                                    onChange={(e) => setForm({ ...form, node: e.target.value.toUpperCase() })}
                                    placeholder="e.g. T1, T2, T3"
                                    disabled={!!editingConfig}
                                />
                                <p className="ls-form-hint">
                                    Multiple tanks can share the same MAC. Each gets a unique node ID.
                                </p>
                            </div>

                            <div className="admin-form-group">
                                <label>Alias (Display Name)</label>
                                <input
                                    type="text"
                                    className="admin-input"
                                    value={form.alias}
                                    onChange={(e) => setForm({ ...form, alias: e.target.value })}
                                    placeholder="e.g. Ground Floor Flush Tank"
                                />
                            </div>

                            <div className="admin-form-group">
                                <label>T1 Reference Value (100% fill)</label>
                                <input
                                    type="number"
                                    className="admin-input"
                                    value={form.t1Ref}
                                    onChange={(e) => setForm({ ...form, t1Ref: e.target.value })}
                                    placeholder="e.g. 500"
                                    min="1"
                                    step="1"
                                />
                                <p className="ls-form-hint">
                                    The d1 value that represents a completely full tank. Level % = (d1 / T1 Ref) × 100
                                </p>
                            </div>
                        </div>

                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="admin-save-btn" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : editingConfig ? "💾 Update" : "✅ Add Tank"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
