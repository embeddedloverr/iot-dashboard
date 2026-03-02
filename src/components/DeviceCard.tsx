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
    return (Date.now() - new Date(mongoTs).getTime()) > OFFLINE_THRESHOLD_MINUTES * 60 * 1000;
}

function getTimeAgo(mongoTs?: string): string {
    if (!mongoTs) return "";
    const minutes = Math.floor((Date.now() - new Date(mongoTs).getTime()) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function rssiIcon(rssi: number) {
    if (rssi > -50) return "📶";
    if (rssi > -70) return "📶";
    return "📶";
}

export default function DeviceCard({
    mac, alias, temp_c, hum_rh, rssi, ssid, ts, mongoTs, onClick, selected = false,
}: DeviceCardProps) {
    const offline = isOffline(mongoTs);
    const tempColor = temp_c >= 45 ? "#ef4444" : temp_c >= 38 ? "#f59e0b" : "#10b981";
    const humColor = hum_rh >= 85 || hum_rh <= 20 ? "#ef4444" : hum_rh >= 70 || hum_rh <= 30 ? "#f59e0b" : "#3b82f6";
    const shortMac = mac.slice(-8);
    const name = alias || shortMac;

    return (
        <div
            className={`dc ${selected ? "dc-sel" : ""} ${offline ? "dc-off" : ""}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
        >
            {/* Top row: name + status */}
            <div className="dc-top">
                <div className="dc-name-row">
                    <span className={`dc-dot ${offline ? "off" : "on"}`} />
                    <span className="dc-name">{name}</span>
                    {alias && <span className="dc-mac">{shortMac}</span>}
                </div>
                <div className="dc-badges">
                    {offline && <span className="dc-offline-tag">OFFLINE</span>}
                    <span className="dc-ssid">{ssid}</span>
                </div>
            </div>

            {/* Main readings */}
            <div className="dc-readings">
                <div className="dc-metric">
                    <div className="dc-metric-head">
                        <span className="dc-metric-icon">🌡️</span>
                        <span className="dc-metric-label">TEMP</span>
                    </div>
                    <div className="dc-metric-val">
                        <span className="dc-val" style={{ color: offline ? "#666" : tempColor }}>{temp_c.toFixed(1)}</span>
                        <span className="dc-unit">°C</span>
                    </div>
                    <div className="dc-bar"><div className="dc-bar-fill" style={{ width: `${Math.min((temp_c / 50) * 100, 100)}%`, background: tempColor, opacity: offline ? 0.3 : 1 }} /></div>
                </div>

                <div className="dc-sep" />

                <div className="dc-metric">
                    <div className="dc-metric-head">
                        <span className="dc-metric-icon">💧</span>
                        <span className="dc-metric-label">HUM</span>
                    </div>
                    <div className="dc-metric-val">
                        <span className="dc-val" style={{ color: offline ? "#666" : humColor }}>{hum_rh.toFixed(1)}</span>
                        <span className="dc-unit">%</span>
                    </div>
                    <div className="dc-bar"><div className="dc-bar-fill" style={{ width: `${Math.min(hum_rh, 100)}%`, background: humColor, opacity: offline ? 0.3 : 1 }} /></div>
                </div>
            </div>

            {/* Footer */}
            <div className="dc-foot">
                <span className="dc-rssi">{rssiIcon(rssi)} {rssi}dBm</span>
                <span className="dc-time">{offline ? `🔴 ${getTimeAgo(mongoTs)}` : ts}</span>
            </div>
        </div>
    );
}
