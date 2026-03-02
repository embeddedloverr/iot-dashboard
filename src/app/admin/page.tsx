"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

interface User {
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

export default function AdminPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [allDevices, setAllDevices] = useState<DeviceInfo[]>([]);
    const [aliases, setAliases] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [form, setForm] = useState({ username: "", password: "", role: "user", devices: [] as string[] });

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const showMsg = (text: string, type: "success" | "error") => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users");
            const data = await res.json();
            if (data.success) setUsers(data.data);
        } catch { showMsg("Failed to load users", "error"); }
        finally { setLoading(false); }
    }, []);

    const fetchDevices = useCallback(async () => {
        try {
            const res = await fetch("/api/sensor/devices");
            const data = await res.json();
            if (data.success) setAllDevices(data.data);
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
        if (user && user.role !== "superadmin" && user.role !== "admin") {
            router.push("/");
            return;
        }
        fetchUsers();
        fetchDevices();
        fetchAliases();
    }, [user, router, fetchUsers, fetchDevices, fetchAliases]);

    const openCreateModal = () => {
        setEditingUser(null);
        setForm({ username: "", password: "", role: "user", devices: [] });
        setShowModal(true);
    };

    const openEditModal = (u: User) => {
        setEditingUser(u);
        setForm({
            username: u.username,
            password: "",
            role: u.role,
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
            devices: prev.devices.length === allDevices.length ? [] : allDevices.map((d) => d.mac),
        }));
    };

    const handleSave = async () => {
        if (!form.username.trim()) { showMsg("Username required", "error"); return; }
        if (!editingUser && !form.password) { showMsg("Password required for new user", "error"); return; }

        try {
            if (editingUser) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const body: any = { username: form.username, role: form.role, devices: form.devices };
                if (form.password) body.password = form.password;

                const res = await fetch(`/api/admin/users/${editingUser._id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const data = await res.json();
                if (data.success) {
                    showMsg(`✅ User "${form.username}" updated`, "success");
                    setShowModal(false);
                    fetchUsers();
                } else {
                    showMsg(data.error, "error");
                }
            } else {
                const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                });
                const data = await res.json();
                if (data.success) {
                    showMsg(`✅ User "${form.username}" created`, "success");
                    setShowModal(false);
                    fetchUsers();
                } else {
                    showMsg(data.error, "error");
                }
            }
        } catch { showMsg("Network error", "error"); }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                showMsg("✅ User deleted", "success");
                setConfirmDelete(null);
                fetchUsers();
            } else {
                showMsg(data.error, "error");
            }
        } catch { showMsg("Network error", "error"); }
    };

    const getDeviceName = (mac: string) => aliases[mac] || mac.slice(-8);

    if (!user || (user.role !== "superadmin" && user.role !== "admin")) return null;

    return (
        <div className="admin-page">
            <div className="admin-topbar">
                <div className="admin-topbar-left">
                    <button className="admin-back-btn" onClick={() => router.push("/")}>← Dashboard</button>
                    <h1>👑 Admin Panel</h1>
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
                        <h2>👥 Users</h2>
                        <p className="admin-section-desc">{users.length} registered user{users.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button className="admin-create-btn" onClick={openCreateModal}>+ Create User</button>
                </div>

                {loading ? (
                    <div className="admin-loading">Loading users...</div>
                ) : users.length === 0 ? (
                    <div className="admin-empty">No users found. Create one to get started.</div>
                ) : (
                    <div className="admin-users-table-wrap">
                        <table className="admin-users-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Devices</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u._id}>
                                        <td>
                                            <div className="admin-user-cell">
                                                <span className="admin-user-avatar">
                                                    {u.role === "superadmin" ? "👑" : u.role === "admin" ? "🛡️" : "👤"}
                                                </span>
                                                <span className="admin-user-name">{u.username}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`admin-role-badge role-${u.role}`}>
                                                {u.role}
                                            </span>
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
                                                <span className="admin-all-devices">All devices</span>
                                            )}
                                        </td>
                                        <td className="admin-date-cell">
                                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                        </td>
                                        <td>
                                            <div className="admin-actions">
                                                <button className="admin-edit-btn" onClick={() => openEditModal(u)} title="Edit">✏️</button>
                                                {u.role !== "superadmin" && (
                                                    confirmDelete === u._id ? (
                                                        <div className="admin-confirm-delete">
                                                            <button className="admin-confirm-yes" onClick={() => handleDelete(u._id)}>Delete</button>
                                                            <button className="admin-confirm-no" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <button className="admin-delete-btn" onClick={() => setConfirmDelete(u._id)} title="Delete">🗑️</button>
                                                    )
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
                            <h3>{editingUser ? `Edit: ${editingUser.username}` : "Create New User"}</h3>
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
                                    placeholder="e.g. john"
                                    disabled={editingUser?.role === "superadmin"}
                                />
                            </div>

                            <div className="admin-form-group">
                                <label>{editingUser ? "New Password (leave blank to keep)" : "Password"}</label>
                                <input
                                    type="password"
                                    className="admin-input"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    placeholder={editingUser ? "••••••" : "Enter password"}
                                />
                            </div>

                            <div className="admin-form-group">
                                <label>Role</label>
                                <select
                                    className="admin-input"
                                    value={form.role}
                                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    disabled={editingUser?.role === "superadmin"}
                                >
                                    <option value="user">👤 User</option>
                                    <option value="admin">🛡️ Admin</option>
                                </select>
                            </div>

                            <div className="admin-form-group">
                                <div className="admin-devices-header">
                                    <label>Device Access</label>
                                    <button className="admin-select-all-btn" onClick={selectAllDevices}>
                                        {form.devices.length === allDevices.length ? "Deselect All" : "Select All"}
                                    </button>
                                </div>
                                <p className="admin-devices-hint">
                                    {form.role === "admin" || form.role === "superadmin"
                                        ? "Admins have access to all devices by default"
                                        : "Select which devices this user can see. Empty = no access."}
                                </p>

                                <div className="admin-device-checkboxes">
                                    {allDevices.length === 0 ? (
                                        <div className="admin-no-devices">No devices detected yet</div>
                                    ) : (
                                        allDevices.map((device) => (
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
                                {editingUser ? "💾 Update User" : "✅ Create User"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
