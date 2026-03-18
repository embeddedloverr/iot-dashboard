"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

interface Subuser {
    _id: string;
    username: string;
    role: string;
    devices: string[];
    createdAt: string;
}

interface DeviceInfo {
    mac: string;
    ssid: string;
}

export default function SubusersPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [subusers, setSubusers] = useState<Subuser[]>([]);
    const [myDevices, setMyDevices] = useState<DeviceInfo[]>([]);
    const [aliases, setAliases] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingSubuser, setEditingSubuser] = useState<Subuser | null>(null);
    const [form, setForm] = useState({ username: "", password: "", devices: [] as string[] });

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const showMsg = (text: string, type: "success" | "error") => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchSubusers = useCallback(async () => {
        try {
            const res = await fetch("/api/subusers");
            const data = await res.json();
            if (data.success) setSubusers(data.data);
        } catch { showMsg("Failed to load subusers", "error"); }
        finally { setLoading(false); }
    }, []);

    const fetchMyDevices = useCallback(async () => {
        // Users can only assign devices they already have access to
        try {
            const res = await fetch("/api/sensor/devices");
            const data = await res.json();
            if (data.success) {
                // The API /api/sensor/devices already filters by what the logged-in user can access
                setMyDevices(data.data);
            }
        } catch { /* ignore */ }
    }, []);

    const fetchAliases = useCallback(async () => {
        try {
            const res = await fetch("/api/devices/aliases");
            const data = await res.json();
            if (data.success) setAliases(data.data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        // Subusers cannot manage subusers
        if (user && user.role === "subuser") {
            router.push("/");
            return;
        }
        if (user) {
            fetchSubusers();
            fetchMyDevices();
            fetchAliases();
        }
    }, [user, router, fetchSubusers, fetchMyDevices, fetchAliases]);

    const openCreateModal = () => {
        setEditingSubuser(null);
        setForm({ username: "", password: "", devices: [] });
        setShowModal(true);
    };

    const openEditModal = (u: Subuser) => {
        setEditingSubuser(u);
        setForm({
            username: u.username,
            password: "",
            devices: u.devices || [],
        });
        setShowModal(true);
    };

    const toggleDevice = (mac: string) => {
        setForm((prev) => ({
            ...prev,
            devices: prev.devices.includes(mac)
                ? prev.devices.filter((d) => d !== mac)
                : [...prev.devices, mac],
        }));
    };

    const selectAllDevices = () => {
        setForm((prev) => ({
            ...prev,
            devices: prev.devices.length === myDevices.length ? [] : myDevices.map((d) => d.mac),
        }));
    };

    const handleSave = async () => {
        if (!form.username.trim()) { showMsg("Username required", "error"); return; }
        if (!editingSubuser && !form.password) { showMsg("Password required for new user", "error"); return; }

        try {
            if (editingSubuser) {
                const body: any = { username: form.username, devices: form.devices };
                if (form.password) body.password = form.password;

                const res = await fetch(`/api/subusers/${editingSubuser._id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                if (data.success) {
                    showMsg(`✅ Subuser "${form.username}" updated`, "success");
                    setShowModal(false);
                    fetchSubusers();
                } else {
                    showMsg(data.error, "error");
                }
            } else {
                const res = await fetch("/api/subusers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                });
                const data = await res.json();
                if (data.success) {
                    showMsg(`✅ Subuser "${form.username}" created`, "success");
                    setShowModal(false);
                    fetchSubusers();
                } else {
                    showMsg(data.error, "error");
                }
            }
        } catch { showMsg("Network error", "error"); }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/subusers/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                showMsg("✅ Subuser deleted", "success");
                setConfirmDelete(null);
                fetchSubusers();
            } else {
                showMsg(data.error, "error");
            }
        } catch { showMsg("Network error", "error"); }
    };

    const getDeviceName = (mac: string) => aliases[mac] || mac?.slice(-8) || "Unknown";

    if (!user || user.role === "subuser") return null;

    return (
        <div className="layout">
            <Sidebar
                activeSection="subusers"
                onSectionChange={(s) => router.push(s === "dashboard" ? "/" : `/${s}`)}
                isAdmin={user?.role === "superadmin" || user?.role === "admin"}
                user={user}
                onLogout={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    router.push("/login");
                }}
            />

            <main className="main-content" style={{ padding: "24px" }}>
                <div className="admin-topbar" style={{ marginBottom: "24px" }}>
                    <div className="admin-topbar-left">
                        <h1>👥 Manage Subusers</h1>
                    </div>
                </div>

                {message && <div className={`alert-message ${message.type}`} style={{ marginBottom: "16px" }}>{message.text}</div>}

                <div className="admin-content" style={{ padding: 0 }}>
                    <div className="admin-section-header" style={{ padding: "20px 24px" }}>
                        <div>
                            <h2>Your Subusers</h2>
                            <p className="admin-section-desc">Create accounts with restricted access to specific devices.</p>
                        </div>
                        <button className="admin-create-btn" onClick={openCreateModal}>+ Create Subuser</button>
                    </div>

                    {loading ? (
                        <div className="admin-loading" style={{ padding: "24px" }}>Loading subusers...</div>
                    ) : subusers.length === 0 ? (
                        <div className="admin-empty" style={{ padding: "48px 24px" }}>No subusers found. Create one to get started.</div>
                    ) : (
                        <div className="admin-users-table-wrap" style={{ margin: 0 }}>
                            <table className="admin-users-table">
                                <thead>
                                    <tr>
                                        <th>Subuser</th>
                                        <th>Granted Devices</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subusers.map((u) => (
                                        <tr key={u._id}>
                                            <td>
                                                <div className="admin-user-cell">
                                                    <span className="admin-user-avatar">🧒</span>
                                                    <span className="admin-user-name">{u.username}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {u.devices && u.devices.length > 0 ? (
                                                    <div className="admin-device-tags">
                                                        {u.devices.slice(0, 3).map((d) => (
                                                            <span key={d} className="admin-device-tag">{getDeviceName(d)}</span>
                                                        ))}
                                                        {u.devices.length > 3 && (
                                                            <span className="admin-device-tag more">+{u.devices.length - 3}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="admin-all-devices" style={{ color: "#8888bb", background: "rgba(136,136,187,0.1)" }}>No devices</span>
                                                )}
                                            </td>
                                            <td className="admin-date-cell">
                                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                            </td>
                                            <td>
                                                <div className="admin-actions">
                                                    <button className="admin-edit-btn" onClick={() => openEditModal(u)} title="Edit">✏️</button>
                                                    {confirmDelete === u._id ? (
                                                        <div className="admin-confirm-delete">
                                                            <button className="admin-confirm-yes" onClick={() => handleDelete(u._id)}>Delete</button>
                                                            <button className="admin-confirm-no" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <button className="admin-delete-btn" onClick={() => setConfirmDelete(u._id)} title="Delete">🗑️</button>
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
                                <h3>{editingSubuser ? `Edit: ${editingSubuser.username}` : "Create New Subuser"}</h3>
                                <button className="admin-modal-close" onClick={() => setShowModal(false)}>✕</button>
                            </div>

                            <div className="admin-modal-body">
                                <div className="admin-form-group">
                                    <label>Username</label>
                                    <input
                                        type="text"
                                        className="admin-input"
                                        value={form.username}
                                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                                        placeholder="e.g. guest"
                                    />
                                </div>

                                <div className="admin-form-group">
                                    <label>{editingSubuser ? "New Password (leave blank to keep)" : "Password"}</label>
                                    <input
                                        type="password"
                                        className="admin-input"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        placeholder={editingSubuser ? "••••••" : "Enter password"}
                                    />
                                </div>

                                <div className="admin-form-group">
                                    <div className="admin-devices-header">
                                        <label>Device Access</label>
                                        <button className="admin-select-all-btn" onClick={selectAllDevices}>
                                            {form.devices.length === myDevices.length ? "Deselect All" : "Select All"}
                                        </button>
                                    </div>
                                    <p className="admin-devices-hint">
                                        Select which of your devices this subuser can monitor.
                                    </p>

                                    <div className="admin-device-checkboxes">
                                        {myDevices.length === 0 ? (
                                            <div className="admin-no-devices">You don't have any devices to share yet.</div>
                                        ) : (
                                            myDevices.map((device) => (
                                                <label key={device.mac} className="admin-device-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.devices.includes(device.mac)}
                                                        onChange={() => toggleDevice(device.mac)}
                                                    />
                                                    <span className="admin-device-check-label">
                                                        <span className="admin-device-check-name">{getDeviceName(device.mac)}</span>
                                                        <span className="admin-device-check-mac">{device.mac}</span>
                                                    </span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="admin-modal-footer">
                                <button className="admin-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                                <button className="admin-save-btn" onClick={handleSave}>
                                    {editingSubuser ? "💾 Update Subuser" : "✅ Create Subuser"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
