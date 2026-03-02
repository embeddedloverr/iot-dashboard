"use client";

import React from "react";

interface DeviceSelectorProps {
    devices: Array<{ mac: string; ssid: string; lastSeen: string; count: number }>;
    aliases: Record<string, string>;
    selectedMac: string;
    onSelect: (mac: string) => void;
}

export default function DeviceSelector({ devices, aliases, selectedMac, onSelect }: DeviceSelectorProps) {
    return (
        <div className="glass-card device-selector">
            <div className="device-selector-header">
                <span className="device-icon">📡</span>
                <h3>Devices</h3>
                <span className="device-count-badge">{devices.length}</span>
            </div>

            {devices.length === 0 ? (
                <div className="device-empty">No devices found</div>
            ) : (
                <div className="device-list">
                    <button
                        onClick={() => onSelect("")}
                        className={`device-item ${selectedMac === "" ? "active" : ""}`}
                    >
                        <span>🌐</span>
                        <div>
                            <div className="device-mac">All Devices</div>
                            <div className="device-meta">Aggregate view</div>
                        </div>
                    </button>

                    {devices.map((device) => {
                        const alias = aliases[device.mac];
                        return (
                            <button
                                key={device.mac}
                                onClick={() => onSelect(device.mac)}
                                className={`device-item ${selectedMac === device.mac ? "active" : ""}`}
                            >
                                <span className="status-dot online" />
                                <div>
                                    <div className="device-mac">{alias || device.mac.slice(-8)}</div>
                                    {alias && <div className="device-meta">{device.mac.slice(-8)}</div>}
                                    <div className="device-meta">{device.ssid} · {device.count.toLocaleString()} readings</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
