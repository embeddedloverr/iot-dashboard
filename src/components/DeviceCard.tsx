"use client";

import React from "react";

interface DeviceCardProps {
    mac: string;
    temp_c: number;
    hum_rh: number;
    rssi: number;
    ssid: string;
    ts: string;
    onClick?: () => void;
    selected?: boolean;
}

export default function DeviceCard({
    mac,
    temp_c,
    hum_rh,
    rssi,
    ssid,
    ts,
    onClick,
    selected = false,
}: DeviceCardProps) {
    const tempPercent = Math.min((temp_c / 60) * 100, 100);
    const humPercent = Math.min((hum_rh / 100) * 100, 100);

    const tempStatus = temp_c >= 45 ? "critical" : temp_c >= 38 ? "warning" : "normal";
    const humStatus = hum_rh >= 85 || hum_rh <= 20 ? "critical" : hum_rh >= 70 || hum_rh <= 30 ? "warning" : "normal";

    const tempStatusColor = tempStatus === "critical" ? "var(--accent-red)" : tempStatus === "warning" ? "var(--accent-orange)" : "var(--accent-green)";
    const humStatusColor = humStatus === "critical" ? "var(--accent-red)" : humStatus === "warning" ? "var(--accent-orange)" : "var(--accent-green)";

    const shortMac = mac.slice(-8);

    return (
        <div
            className={`glass-card device-card ${selected ? "device-card-selected" : ""}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
        >
            {/* Card Header */}
            <div className="device-card-header">
                <div className="device-card-identity">
                    <span className={`status-dot online`} />
                    <span className="device-card-mac">{shortMac}</span>
                </div>
                <span className="device-card-ssid">{ssid}</span>
            </div>

            {/* Readings Row */}
            <div className="device-card-readings">
                {/* Temperature */}
                <div className="device-card-reading">
                    <div className="reading-icon-row">
                        <span className="reading-icon">🌡️</span>
                        <span className="reading-label">Temperature</span>
                    </div>
                    <div className="reading-value-row">
                        <span className="reading-value" style={{ color: tempStatusColor }}>{temp_c.toFixed(1)}</span>
                        <span className="reading-unit">°C</span>
                    </div>
                    <div className="reading-bar-track">
                        <div
                            className="reading-bar-fill reading-bar-temp"
                            style={{ width: `${tempPercent}%` }}
                        />
                    </div>
                    <div className="reading-status">
                        <span className="reading-status-dot" style={{ background: tempStatusColor }} />
                        <span style={{ color: tempStatusColor }}>{tempStatus}</span>
                    </div>
                </div>

                {/* Divider */}
                <div className="device-card-divider" />

                {/* Humidity */}
                <div className="device-card-reading">
                    <div className="reading-icon-row">
                        <span className="reading-icon">💧</span>
                        <span className="reading-label">Humidity</span>
                    </div>
                    <div className="reading-value-row">
                        <span className="reading-value" style={{ color: humStatusColor }}>{hum_rh.toFixed(1)}</span>
                        <span className="reading-unit">%</span>
                    </div>
                    <div className="reading-bar-track">
                        <div
                            className="reading-bar-fill reading-bar-hum"
                            style={{ width: `${humPercent}%` }}
                        />
                    </div>
                    <div className="reading-status">
                        <span className="reading-status-dot" style={{ background: humStatusColor }} />
                        <span style={{ color: humStatusColor }}>{humStatus}</span>
                    </div>
                </div>
            </div>

            {/* Card Footer */}
            <div className="device-card-footer">
                <div className="device-card-meta">
                    <span className="meta-label">RSSI</span>
                    <span className="meta-value" style={{ color: rssi > -50 ? "var(--accent-green)" : "var(--accent-orange)" }}>
                        {rssi} dBm
                    </span>
                </div>
                <div className="device-card-meta">
                    <span className="meta-label">Last seen</span>
                    <span className="meta-value">{ts}</span>
                </div>
            </div>
        </div>
    );
}
