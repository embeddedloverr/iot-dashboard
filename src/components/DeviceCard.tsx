"use client";

import React from "react";

interface DeviceCardProps {
    mac: string;
    alias?: string;
    temp_c: number;
    hum_rh: number;
    rssi: number;
    ssid: string;
    ts: string;
    mongoTs?: string;
    onClick?: () => void;
    selected?: boolean;
}

const OFFLINE_THRESHOLD_MINUTES = 30;

function isOffline(mongoTs?: string): boolean {
    if (!mongoTs) return false;
    const lastSeen = new Date(mongoTs).getTime();
    const now = Date.now();
    return (now - lastSeen) > OFFLINE_THRESHOLD_MINUTES * 60 * 1000;
}

function getTimeAgo(mongoTs?: string): string {
    if (!mongoTs) return "";
    const diff = Date.now() - new Date(mongoTs).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ago`;
}

export default function DeviceCard({
    mac,
    alias,
    temp_c,
    hum_rh,
    rssi,
    ssid,
    ts,
    mongoTs,
    onClick,
    selected = false,
}: DeviceCardProps) {
    const tempPercent = Math.min((temp_c / 60) * 100, 100);
    const humPercent = Math.min((hum_rh / 100) * 100, 100);

    const offline = isOffline(mongoTs);

    const tempStatus = temp_c >= 45 ? "critical" : temp_c >= 38 ? "warning" : "normal";
    const humStatus = hum_rh >= 85 || hum_rh <= 20 ? "critical" : hum_rh >= 70 || hum_rh <= 30 ? "warning" : "normal";

    const tempStatusColor = tempStatus === "critical" ? "var(--accent-red)" : tempStatus === "warning" ? "var(--accent-orange)" : "var(--accent-green)";
    const humStatusColor = humStatus === "critical" ? "var(--accent-red)" : humStatus === "warning" ? "var(--accent-orange)" : "var(--accent-green)";

    const shortMac = mac.slice(-8);
    const displayName = alias || shortMac;

    return (
        <div
            className={`glass-card device-card ${selected ? "device-card-selected" : ""} ${offline ? "device-card-offline" : ""}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
        >
            {/* Offline overlay */}
            {offline && <div className="offline-badge">⚠️ OFFLINE</div>}

            <div className="device-card-header">
                <div className="device-card-identity">
                    <span className={`status-dot ${offline ? "offline" : "online"}`} />
                    <div>
                        <span className="device-card-name">{displayName}</span>
                        {alias && <span className="device-card-mac-sub">{shortMac}</span>}
                    </div>
                </div>
                <span className="device-card-ssid">{ssid}</span>
            </div>

            <div className="device-card-readings">
                <div className="device-card-reading">
                    <div className="reading-icon-row">
                        <span className="reading-icon">🌡️</span>
                        <span className="reading-label">Temperature</span>
                    </div>
                    <div className="reading-value-row">
                        <span className="reading-value" style={{ color: offline ? "var(--text-secondary)" : tempStatusColor }}>{temp_c.toFixed(1)}</span>
                        <span className="reading-unit">°C</span>
                    </div>
                    <div className="reading-bar-track">
                        <div className="reading-bar-fill reading-bar-temp" style={{ width: `${tempPercent}%`, opacity: offline ? 0.4 : 1 }} />
                    </div>
                    <div className="reading-status">
                        <span className="reading-status-dot" style={{ background: offline ? "var(--accent-red)" : tempStatusColor }} />
                        <span style={{ color: offline ? "var(--text-secondary)" : tempStatusColor }}>{offline ? "stale" : tempStatus}</span>
                    </div>
                </div>

                <div className="device-card-divider" />

                <div className="device-card-reading">
                    <div className="reading-icon-row">
                        <span className="reading-icon">💧</span>
                        <span className="reading-label">Humidity</span>
                    </div>
                    <div className="reading-value-row">
                        <span className="reading-value" style={{ color: offline ? "var(--text-secondary)" : humStatusColor }}>{hum_rh.toFixed(1)}</span>
                        <span className="reading-unit">%</span>
                    </div>
                    <div className="reading-bar-track">
                        <div className="reading-bar-fill reading-bar-hum" style={{ width: `${humPercent}%`, opacity: offline ? 0.4 : 1 }} />
                    </div>
                    <div className="reading-status">
                        <span className="reading-status-dot" style={{ background: offline ? "var(--accent-red)" : humStatusColor }} />
                        <span style={{ color: offline ? "var(--text-secondary)" : humStatusColor }}>{offline ? "stale" : humStatus}</span>
                    </div>
                </div>
            </div>

            <div className="device-card-footer">
                <div className="device-card-meta">
                    <span className="meta-label">RSSI</span>
                    <span className="meta-value" style={{ color: rssi > -50 ? "var(--accent-green)" : "var(--accent-orange)" }}>
                        {rssi} dBm
                    </span>
                </div>
                <div className="device-card-meta">
                    <span className="meta-label">{offline ? "Last seen" : "Updated"}</span>
                    <span className="meta-value" style={{ color: offline ? "var(--accent-red)" : undefined }}>
                        {offline ? getTimeAgo(mongoTs) : ts}
                    </span>
                </div>
            </div>
        </div>
    );
}
