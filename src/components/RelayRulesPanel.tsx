"use client";

import React, { useState, useEffect, useCallback } from "react";

// --- Type definitions ---
interface RelayCondition {
    id: string;
    priority: number;
    field: "temp_c" | "hum_rh";
    operator: ">" | "<" | ">=" | "<=" | "==";
    value: number;
    action: "ON" | "OFF";
    relayChannel: number;
}

interface RelayRule {
    _id?: string;
    relayName: string;
    relayMac: string;
    relayEndpoint: string;
    enabled: boolean;
    sensorMac: string;
    sensorAlias?: string;
    conditions: RelayCondition[];
    defaultAction: "ON" | "OFF";
    defaultChannel: number;
    cooldownSeconds: number;
    lastExecutedAt?: string;
    lastAction?: string;
    createdAt?: string;
    updatedAt?: string;
}

interface DeviceInfo {
    mac: string;
    alias: string;
}

interface RelayRulesPanelProps {
    devices: DeviceInfo[];
    aliases: Record<string, string>;
}

// --- Helpers ---
const EMPTY_CONDITION = (): RelayCondition => ({
    id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    priority: 1,
    field: "temp_c",
    operator: ">",
    value: 38,
    action: "ON",
    relayChannel: 1,
});

const EMPTY_RULE = (): RelayRule => ({
    relayName: "",
    relayMac: "",
    relayEndpoint: "",
    enabled: true,
    sensorMac: "",
    conditions: [EMPTY_CONDITION()],
    defaultAction: "OFF",
    defaultChannel: 1,
    cooldownSeconds: 60,
});

const FIELD_LABELS: Record<string, string> = {
    temp_c: "🌡️ Temperature (°C)",
    hum_rh: "💧 Humidity (%)",
};

const OPERATOR_LABELS: Record<string, string> = {
    ">": ">  greater than",
    "<": "<  less than",
    ">=": "≥  greater or equal",
    "<=": "≤  less or equal",
    "==": "=  equal to",
};

// --- Main Component ---
export default function RelayRulesPanel({ devices, aliases }: RelayRulesPanelProps) {
    const [rules, setRules] = useState<RelayRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
    const [activeTab, setActiveTab] = useState<"rules" | "log">("rules");
    const [debugLog, setDebugLog] = useState<string[] | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editForm, setEditForm] = useState<RelayRule>(EMPTY_RULE());
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    // Log state
    const [logs, setLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);

    const showMsg = (text: string, type: "success" | "error", ms = 4000) => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), ms);
    };

    // --- Data fetching ---
    const fetchRules = useCallback(async () => {
        try {
            const res = await fetch("/api/relay/rules");
            const data = await res.json();
            if (data.success) setRules(data.data);
        } catch (err) {
            console.error("Failed to fetch relay rules:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true);
        try {
            const res = await fetch("/api/relay/execute");
            // We don't actually call execute for logs, but for now
            // the execute endpoint returns debug info
            const data = await res.json();
            if (data.debug) setDebugLog(data.debug);
        } catch (err) {
            console.error("Failed to fetch relay logs:", err);
        } finally {
            setLogsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    // --- CRUD operations ---
    const openCreate = () => {
        setEditForm(EMPTY_RULE());
        setShowModal(true);
    };

    const openEdit = (rule: RelayRule) => {
        setEditForm({
            ...rule,
            conditions: rule.conditions.length > 0 ? [...rule.conditions] : [EMPTY_CONDITION()],
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!editForm.relayName.trim()) {
            showMsg("Relay name is required", "error");
            return;
        }
        if (!editForm.relayEndpoint.trim()) {
            showMsg("Relay endpoint URL is required", "error");
            return;
        }
        if (!editForm.sensorMac) {
            showMsg("Select a source sensor", "error");
            return;
        }
        if (editForm.conditions.length === 0) {
            showMsg("Add at least one condition", "error");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/relay/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(
                    editForm._id
                        ? `✅ Rule "${editForm.relayName}" updated`
                        : `✅ Rule "${editForm.relayName}" created`,
                    "success"
                );
                setShowModal(false);
                fetchRules();
            } else {
                showMsg(data.error || "Failed to save", "error");
            }
        } catch {
            showMsg("Network error saving rule", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/relay/rules?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                showMsg("✅ Rule deleted", "success");
                setConfirmDelete(null);
                fetchRules();
            } else {
                showMsg(data.error || "Failed to delete", "error");
            }
        } catch {
            showMsg("Network error", "error");
        }
    };

    const handleToggle = async (rule: RelayRule) => {
        try {
            await fetch("/api/relay/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...rule, enabled: !rule.enabled }),
            });
            fetchRules();
        } catch {
            showMsg("Failed to toggle", "error");
        }
    };

    const executeNow = async () => {
        try {
            const res = await fetch("/api/relay/execute");
            const data = await res.json();
            setDebugLog(data.debug || []);
            if (data.executed > 0) {
                showMsg(`⚡ ${data.executed} relay command(s) executed`, "success", 6000);
            } else {
                showMsg("✅ No relay actions needed", "success");
            }
            fetchRules(); // refresh last executed status
        } catch {
            showMsg("Failed to execute", "error");
        }
    };

    // --- Condition editing helpers ---
    const updateCondition = (index: number, updates: Partial<RelayCondition>) => {
        const newConds = [...editForm.conditions];
        newConds[index] = { ...newConds[index], ...updates };
        setEditForm({ ...editForm, conditions: newConds });
    };

    const addCondition = () => {
        setEditForm({
            ...editForm,
            conditions: [...editForm.conditions, EMPTY_CONDITION()],
        });
    };

    const removeCondition = (index: number) => {
        const newConds = editForm.conditions.filter((_, i) => i !== index);
        setEditForm({ ...editForm, conditions: newConds });
    };

    const moveCondition = (index: number, direction: "up" | "down") => {
        const newConds = [...editForm.conditions];
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newConds.length) return;
        [newConds[index], newConds[targetIndex]] = [newConds[targetIndex], newConds[index]];
        setEditForm({ ...editForm, conditions: newConds });
    };

    const getDeviceName = (mac: string) => aliases[mac] || mac?.slice(-8) || "Unknown";

    const formatDate = (s: string) =>
        new Date(s).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });

    // --- Render ---
    return (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {/* Header */}
            <div className="relay-panel-header">
                <div className="relay-panel-title">
                    <span style={{ fontSize: 24 }}>⚡</span>
                    <div>
                        <h2>Relay Control Rules</h2>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                            Automate relay commands based on sensor conditions
                        </p>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="relay-btn-secondary" onClick={executeNow}>
                        🔄 Execute Now
                    </button>
                    <button className="relay-btn-primary" onClick={openCreate}>
                        + New Rule
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="alert-tabs" style={{ marginBottom: 16 }}>
                <button
                    className={`alert-tab ${activeTab === "rules" ? "active" : ""}`}
                    onClick={() => setActiveTab("rules")}
                >
                    ⚡ Rules ({rules.length})
                </button>
                <button
                    className={`alert-tab ${activeTab === "log" ? "active" : ""}`}
                    onClick={() => {
                        setActiveTab("log");
                        if (!debugLog) executeNow();
                    }}
                >
                    📋 Execution Log
                </button>
            </div>

            {message && (
                <div className={`alert-message ${message.type}`} style={{ marginBottom: 16 }}>
                    {message.text}
                </div>
            )}

            {/* TAB: Rules List */}
            {activeTab === "rules" && (
                <div>
                    {loading ? (
                        <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                            <div className="relay-spinner" />
                            <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>Loading rules...</p>
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="glass-card" style={{ padding: 48, textAlign: "center" }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
                            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No relay rules configured</p>
                            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
                                Create rules to automatically control relays based on sensor data
                            </p>
                            <button className="relay-btn-primary" onClick={openCreate}>
                                + Create First Rule
                            </button>
                        </div>
                    ) : (
                        <div className="relay-rules-list">
                            {rules.map((rule) => (
                                <div key={rule._id} className="relay-rule-card glass-card">
                                    {/* Rule Header */}
                                    <div className="relay-rule-header">
                                        <div className="relay-rule-identity">
                                            <span className={`status-dot ${rule.enabled ? "online" : "offline"}`} />
                                            <div>
                                                <div className="relay-rule-name">{rule.relayName}</div>
                                                <div className="relay-rule-meta">
                                                    📡 {rule.sensorAlias || getDeviceName(rule.sensorMac)}
                                                    {" → "}
                                                    🔌 {rule.relayEndpoint}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span
                                                className="relay-status-badge"
                                                style={{
                                                    background: rule.enabled
                                                        ? "rgba(16,185,129,0.1)"
                                                        : "rgba(239,68,68,0.1)",
                                                    color: rule.enabled ? "#10b981" : "#ef4444",
                                                    borderColor: rule.enabled
                                                        ? "rgba(16,185,129,0.2)"
                                                        : "rgba(239,68,68,0.2)",
                                                }}
                                            >
                                                {rule.enabled ? "🟢 Active" : "🔴 Disabled"}
                                            </span>
                                            {rule.lastAction && (
                                                <span
                                                    className="relay-status-badge"
                                                    style={{
                                                        background:
                                                            rule.lastAction === "ON"
                                                                ? "rgba(79,125,245,0.1)"
                                                                : "rgba(100,100,100,0.1)",
                                                        color:
                                                            rule.lastAction === "ON"
                                                                ? "#4f7df5"
                                                                : "var(--text-secondary)",
                                                        borderColor:
                                                            rule.lastAction === "ON"
                                                                ? "rgba(79,125,245,0.2)"
                                                                : "rgba(100,100,100,0.2)",
                                                    }}
                                                >
                                                    Last: {rule.lastAction}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Conditions Summary */}
                                    <div className="relay-conditions-summary">
                                        {rule.conditions.map((cond, i) => {
                                            const fieldLabel =
                                                cond.field === "temp_c" ? "Temp" : "Humidity";
                                            const unit = cond.field === "temp_c" ? "°C" : "%";
                                            return (
                                                <div key={cond.id || i} className="relay-cond-pill">
                                                    <span className="relay-cond-keyword">
                                                        {i === 0 ? "IF" : "ELIF"}
                                                    </span>
                                                    <span>
                                                        {fieldLabel} {cond.operator} {cond.value}
                                                        {unit}
                                                    </span>
                                                    <span className="relay-cond-arrow">→</span>
                                                    <span
                                                        className={`relay-action-badge ${cond.action === "ON" ? "on" : "off"}`}
                                                    >
                                                        {cond.action}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        <div className="relay-cond-pill relay-cond-default">
                                            <span className="relay-cond-keyword">ELSE</span>
                                            <span className="relay-cond-arrow">→</span>
                                            <span
                                                className={`relay-action-badge ${rule.defaultAction === "ON" ? "on" : "off"}`}
                                            >
                                                {rule.defaultAction}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Rule Footer */}
                                    <div className="relay-rule-footer">
                                        <div className="relay-rule-info">
                                            <span>⏱ Cooldown: {rule.cooldownSeconds}s</span>
                                            {rule.lastExecutedAt && (
                                                <span>Last: {formatDate(rule.lastExecutedAt)}</span>
                                            )}
                                        </div>
                                        <div className="relay-rule-actions">
                                            <button
                                                className="relay-btn-icon"
                                                onClick={() => handleToggle(rule)}
                                                title={rule.enabled ? "Disable" : "Enable"}
                                            >
                                                {rule.enabled ? "⏸" : "▶️"}
                                            </button>
                                            <button
                                                className="relay-btn-icon"
                                                onClick={() => openEdit(rule)}
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            {confirmDelete === rule._id ? (
                                                <div style={{ display: "flex", gap: 4 }}>
                                                    <button
                                                        className="relay-btn-danger-sm"
                                                        onClick={() => handleDelete(rule._id!)}
                                                    >
                                                        Delete
                                                    </button>
                                                    <button
                                                        className="relay-btn-cancel-sm"
                                                        onClick={() => setConfirmDelete(null)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="relay-btn-icon relay-btn-icon-danger"
                                                    onClick={() => setConfirmDelete(rule._id!)}
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB: Execution Log */}
            {activeTab === "log" && (
                <div className="glass-card" style={{ padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600 }}>📋 Last Execution Debug Log</h3>
                        <button className="relay-btn-secondary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={executeNow}>
                            🔄 Run Now
                        </button>
                    </div>
                    {debugLog && debugLog.length > 0 ? (
                        <div
                            style={{
                                fontFamily: "monospace",
                                fontSize: 11,
                                lineHeight: 1.8,
                                whiteSpace: "pre-wrap",
                                color: "var(--text-secondary)",
                            }}
                        >
                            {debugLog.map((line, i) => (
                                <div
                                    key={i}
                                    style={{
                                        color: line.includes("✓")
                                            ? "#10b981"
                                            : line.includes("✗") || line.includes("FATAL")
                                            ? "#ef4444"
                                            : line.includes("Cooldown") || line.includes("unchanged")
                                            ? "#f59e0b"
                                            : "var(--text-secondary)",
                                    }}
                                >
                                    {line}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: 24 }}>
                            Click "Run Now" to execute rules and view the log
                        </p>
                    )}
                </div>
            )}

            {/* ========== CREATE / EDIT MODAL ========== */}
            {showModal && (
                <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
                    <div
                        className="admin-modal relay-rule-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="admin-modal-header">
                            <h3>
                                {editForm._id ? "✏️ Edit Rule" : "⚡ New Relay Rule"}:{" "}
                                {editForm.relayName || "Untitled"}
                            </h3>
                            <button className="admin-modal-close" onClick={() => setShowModal(false)}>
                                ✕
                            </button>
                        </div>

                        <div className="admin-modal-body relay-modal-body">
                            {/* Basic Info */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">📝 Basic Info</div>
                                <div className="relay-form-grid">
                                    <div className="admin-form-group">
                                        <label>Relay Name</label>
                                        <input
                                            type="text"
                                            className="admin-input"
                                            placeholder="e.g. Server Room AC"
                                            value={editForm.relayName}
                                            onChange={(e) =>
                                                setEditForm({ ...editForm, relayName: e.target.value })
                                            }
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label>Relay MAC (optional)</label>
                                        <input
                                            type="text"
                                            className="admin-input"
                                            placeholder="e.g. AA:BB:CC:DD:EE:FF"
                                            value={editForm.relayMac}
                                            onChange={(e) =>
                                                setEditForm({ ...editForm, relayMac: e.target.value.toUpperCase() })
                                            }
                                            style={{ fontFamily: "monospace" }}
                                        />
                                    </div>
                                </div>

                                <div className="admin-form-group">
                                    <label>🔌 Relay HTTP Endpoint</label>
                                    <input
                                        type="text"
                                        className="admin-input"
                                        placeholder="http://192.168.1.50/relay"
                                        value={editForm.relayEndpoint}
                                        onChange={(e) =>
                                            setEditForm({ ...editForm, relayEndpoint: e.target.value })
                                        }
                                        style={{ fontFamily: "monospace" }}
                                    />
                                    <p className="relay-form-hint">
                                        Sends POST with {"{"}&quot;channel&quot;: N, &quot;action&quot;: &quot;ON/OFF&quot;{"}"}
                                    </p>
                                </div>

                                <div className="admin-form-group">
                                    <label>📡 Source Sensor</label>
                                    <select
                                        className="admin-input relay-select"
                                        value={editForm.sensorMac}
                                        onChange={(e) =>
                                            setEditForm({ ...editForm, sensorMac: e.target.value })
                                        }
                                    >
                                        <option value="">— Select a sensor —</option>
                                        {devices.map((d) => (
                                            <option key={d.mac} value={d.mac}>
                                                {d.alias || d.mac} ({d.mac})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="relay-form-row">
                                    <div className="admin-form-group" style={{ flex: 1 }}>
                                        <label>⏱ Cooldown (seconds)</label>
                                        <input
                                            type="number"
                                            className="admin-input"
                                            min={10}
                                            max={3600}
                                            value={editForm.cooldownSeconds}
                                            onChange={(e) =>
                                                setEditForm({
                                                    ...editForm,
                                                    cooldownSeconds: Number(e.target.value),
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="admin-form-group" style={{ flex: 1 }}>
                                        <label>Enable Rule</label>
                                        <button
                                            onClick={() =>
                                                setEditForm({ ...editForm, enabled: !editForm.enabled })
                                            }
                                            className={`toggle-switch ${editForm.enabled ? "active" : ""}`}
                                            style={{ marginTop: 4 }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Conditions Builder */}
                            <div className="relay-form-section">
                                <div className="relay-form-section-title">
                                    🔀 Conditions
                                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-secondary)", marginLeft: 8 }}>
                                        First matching condition wins
                                    </span>
                                </div>

                                <div className="relay-conditions-builder">
                                    {editForm.conditions.map((cond, index) => (
                                        <div key={cond.id || index} className="relay-condition-row">
                                            {/* Keyword */}
                                            <div className="relay-cond-keyword-tag">
                                                {index === 0 ? "IF" : "ELIF"}
                                            </div>

                                            {/* Field */}
                                            <select
                                                className="relay-cond-select relay-cond-field"
                                                value={cond.field}
                                                onChange={(e) =>
                                                    updateCondition(index, {
                                                        field: e.target.value as "temp_c" | "hum_rh",
                                                    })
                                                }
                                            >
                                                <option value="temp_c">🌡️ Temp</option>
                                                <option value="hum_rh">💧 Humidity</option>
                                            </select>

                                            {/* Operator */}
                                            <select
                                                className="relay-cond-select relay-cond-op"
                                                value={cond.operator}
                                                onChange={(e) =>
                                                    updateCondition(index, {
                                                        operator: e.target.value as RelayCondition["operator"],
                                                    })
                                                }
                                            >
                                                <option value=">">&gt;</option>
                                                <option value="<">&lt;</option>
                                                <option value=">=">&ge;</option>
                                                <option value="<=">&le;</option>
                                                <option value="==">=</option>
                                            </select>

                                            {/* Value */}
                                            <input
                                                type="number"
                                                className="relay-cond-input"
                                                value={cond.value}
                                                onChange={(e) =>
                                                    updateCondition(index, { value: Number(e.target.value) })
                                                }
                                                step={0.5}
                                            />

                                            {/* Arrow */}
                                            <span className="relay-cond-arrow-builder">→</span>

                                            {/* Action */}
                                            <select
                                                className={`relay-cond-select relay-cond-action ${cond.action === "ON" ? "action-on" : "action-off"}`}
                                                value={cond.action}
                                                onChange={(e) =>
                                                    updateCondition(index, {
                                                        action: e.target.value as "ON" | "OFF",
                                                    })
                                                }
                                            >
                                                <option value="ON">ON</option>
                                                <option value="OFF">OFF</option>
                                            </select>

                                            {/* Channel */}
                                            <select
                                                className="relay-cond-select relay-cond-channel"
                                                value={cond.relayChannel}
                                                onChange={(e) =>
                                                    updateCondition(index, {
                                                        relayChannel: Number(e.target.value),
                                                    })
                                                }
                                            >
                                                <option value={1}>Ch 1</option>
                                                <option value={2}>Ch 2</option>
                                                <option value={3}>Ch 3</option>
                                                <option value={4}>Ch 4</option>
                                            </select>

                                            {/* Move / Delete controls */}
                                            <div className="relay-cond-controls">
                                                <button
                                                    className="relay-cond-ctrl-btn"
                                                    onClick={() => moveCondition(index, "up")}
                                                    disabled={index === 0}
                                                    title="Move up"
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    className="relay-cond-ctrl-btn"
                                                    onClick={() => moveCondition(index, "down")}
                                                    disabled={index === editForm.conditions.length - 1}
                                                    title="Move down"
                                                >
                                                    ↓
                                                </button>
                                                {editForm.conditions.length > 1 && (
                                                    <button
                                                        className="relay-cond-ctrl-btn relay-cond-ctrl-del"
                                                        onClick={() => removeCondition(index)}
                                                        title="Remove condition"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Add condition button */}
                                    <button className="relay-add-cond-btn" onClick={addCondition}>
                                        + Add Condition
                                    </button>

                                    {/* Default action */}
                                    <div className="relay-default-row">
                                        <div className="relay-cond-keyword-tag relay-else-tag">ELSE</div>
                                        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                                            Default action →
                                        </span>
                                        <select
                                            className={`relay-cond-select relay-cond-action ${editForm.defaultAction === "ON" ? "action-on" : "action-off"}`}
                                            value={editForm.defaultAction}
                                            onChange={(e) =>
                                                setEditForm({
                                                    ...editForm,
                                                    defaultAction: e.target.value as "ON" | "OFF",
                                                })
                                            }
                                        >
                                            <option value="ON">ON</option>
                                            <option value="OFF">OFF</option>
                                        </select>
                                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                            (when no condition matches)
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="admin-save-btn"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving ? "Saving..." : "💾 Save Rule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
