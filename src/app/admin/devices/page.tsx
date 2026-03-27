"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

interface Device {
    mac: string;
    alias: string;
    lastSeen?: string;
    updatedAt?: string;
    isRegistered?: boolean;
    isDiscovered?: boolean;
}

export default function AdminDevicesPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [form, setForm] = useState({ mac: "", alias: "" });
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const showMsg = (text: string, type: "success" | "error") => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchDevices = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/devices");
            const data = await res.json();
            if (data.success) {
                setDevices(data.data);
            } else {
                showMsg(data.error || "Failed to load devices", "error");
            }
        } catch { 
            showMsg("Network error fetching devices", "error"); 
        } finally { 
            setLoading(false); 
        }
    }, []);

    useEffect(() => {
        if (user && user.role !== "superadmin" && user.role !== "admin") {
            router.push("/");
            return;
        }
        fetchDevices();
    }, [user, router, fetchDevices]);

    const openCreateModal = () => {
        setEditingDevice(null);
        setForm({ mac: "", alias: "" });
        setShowModal(true);
    };

    const openEditModal = (d: Device) => {
        setEditingDevice(d);
        setForm({
            mac: d.mac,
            alias: d.alias !== d.mac ? d.alias : "",
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.mac.trim() || !form.alias.trim()) { 
            showMsg("MAC Address and Alias are required", "error"); 
            return; 
        }

        try {
            const res = await fetch("/api/admin/devices", {
                method: "POST", // POST handles both insert and update (upsert)
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mac: form.mac.trim(), alias: form.alias.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                showMsg(`✅ Device saved successfully`, "success");
                setShowModal(false);
                fetchDevices();
            } else {
                showMsg(data.error, "error");
            }
        } catch { 
            showMsg("Network error saving device", "error"); 
        }
    };

    const handleDelete = async (mac: string) => {
        try {
            const res = await fetch(`/api/admin/devices/${encodeURIComponent(mac)}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                showMsg("✅ Device deleted", "success");
                setConfirmDelete(null);
                fetchDevices();
            } else {
                showMsg(data.error, "error");
            }
        } catch { 
            showMsg("Network error deleting device", "error"); 
        }
    };

    if (!user || (user.role !== "superadmin" && user.role !== "admin")) return null;

    return (
        <div className="admin-page">
            <div className="admin-topbar">
                <div className="admin-topbar-left">
                    <button className="admin-back-btn" onClick={() => router.push("/")}>← Dashboard</button>
                    <h1>📱 Admin Devices</h1>
                </div>
                <div className="admin-topbar-right">
                    <span className="admin-user-badge">
                        {user.role === "superadmin" ? "👑" : "🛡️"} {user.username}
                    </span>
                </div>
            </div>

            {message && <div className={`alert-message ${message.type}`} style={{ margin: "0 24px 16px" }}>{message.text}</div>}

            <div className="admin-content">
                <div className="admin-section-header">
                    <div>
                        <h2>📡 Master Device Registry</h2>
                        <p className="admin-section-desc">Manage all devices tracked by the system.</p>
                    </div>
                    <button className="admin-create-btn" onClick={openCreateModal}>+ Register Device</button>
                </div>

                {loading ? (
                    <div className="admin-loading">Loading devices...</div>
                ) : devices.length === 0 ? (
                    <div className="admin-empty">No devices found.</div>
                ) : (
                    <div className="admin-users-table-wrap">
                        <table className="admin-users-table">
                            <thead>
                                <tr>
                                    <th>MAC Address</th>
                                    <th>Alias</th>
                                    <th>Status</th>
                                    <th>Last Seen (Data)</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map((d) => (
                                    <tr key={d.mac}>
                                        <td className="admin-user-cell" style={{fontFamily: "monospace"}}>
                                            <span className="admin-device-check-mac">{d.mac}</span>
                                        </td>
                                        <td>
                                            <span className="admin-user-name" style={{fontWeight: 600}}>{d.alias}</span>
                                        </td>
                                        <td>
                                            {d.isRegistered ? (
                                                <span className="admin-role-badge role-admin" style={{background: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.2)"}}>Registered</span>
                                            ) : (
                                                <span className="admin-role-badge role-user" style={{background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.2)"}}>Unregistered</span>
                                            )}
                                        </td>
                                        <td className="admin-date-cell">
                                            {d.lastSeen ? new Date(d.lastSeen).toLocaleString("en-IN") : "Never"}
                                        </td>
                                        <td>
                                            <div className="admin-actions">
                                                <button className="admin-edit-btn" onClick={() => openEditModal(d)} title="Edit Alias">✏️</button>
                                                {confirmDelete === d.mac ? (
                                                    <div className="admin-confirm-delete">
                                                        <button className="admin-confirm-yes" onClick={() => handleDelete(d.mac)}>Delete</button>
                                                        <button className="admin-confirm-no" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button className="admin-delete-btn" onClick={() => setConfirmDelete(d.mac)} title="Delete device manually assigned alias. (Does not remove historical graphs)">🗑️</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h3>{editingDevice ? `Edit Alias: ${editingDevice.mac}` : "Register New Device"}</h3>
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
                                    placeholder="e.g. AA:BB:CC:DD:EE:FF"
                                    disabled={!!editingDevice}
                                    style={{fontFamily: "monospace"}}
                                />
                                {editingDevice && <p className="admin-devices-hint">MAC Address cannot be changed once registered.</p>}
                            </div>

                            <div className="admin-form-group">
                                <label>Location / Alias</label>
                                <input
                                    type="text"
                                    className="admin-input"
                                    value={form.alias}
                                    onChange={(e) => setForm({ ...form, alias: e.target.value })}
                                    placeholder="e.g. Main Server Room"
                                />
                            </div>
                        </div>

                        <div className="admin-modal-footer">
                            <button className="admin-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="admin-save-btn" onClick={handleSave}>
                                {editingDevice ? "💾 Update Alias" : "✅ Register Device"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
