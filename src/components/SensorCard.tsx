"use client";

import React from "react";

interface SensorCardProps {
    label: string;
    value: number | null;
    unit: string;
    icon: string;
    gradient: string;
    rangeMin?: number;
    rangeMax?: number;
    status?: "normal" | "warning" | "critical";
}

export default function SensorCard({
    label,
    value,
    unit,
    icon,
    gradient,
    rangeMin = 0,
    rangeMax = 100,
    status = "normal",
}: SensorCardProps) {
    const percentage = value !== null ? Math.min(((value - rangeMin) / (rangeMax - rangeMin)) * 100, 100) : 0;
    const circumference = 2 * Math.PI * 54;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    const statusClass = status === "critical" ? "offline" : status === "warning" ? "warning" : "online";
    const statusColor =
        status === "critical" ? "var(--accent-red)" : status === "warning" ? "var(--accent-orange)" : "var(--accent-green)";

    const gradientId = `gaugeGrad-${gradient}-${label.replace(/\s/g, "")}`;

    return (
        <div className="glass-card sensor-card">
            <div className="sensor-card-header">
                <div className="sensor-card-label">
                    <span className="sensor-icon">{icon}</span>
                    <span>{label}</span>
                </div>
                <div className="sensor-card-status">
                    <span className={`status-dot ${statusClass}`} />
                    <span className="status-text" style={{ color: statusColor }}>{status}</span>
                </div>
            </div>

            <div className="gauge-wrapper">
                <svg viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
                    <circle
                        cx="60" cy="60" r="54"
                        fill="none"
                        stroke={`url(#${gradientId})`}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="gauge-ring"
                    />
                    <defs>
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            {gradient === "temp" ? (
                                <>
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="100%" stopColor="#f97316" />
                                </>
                            ) : (
                                <>
                                    <stop offset="0%" stopColor="#06b6d4" />
                                    <stop offset="100%" stopColor="#3b82f6" />
                                </>
                            )}
                        </linearGradient>
                    </defs>
                </svg>
                <div className="gauge-value-overlay">
                    {value !== null ? (
                        <>
                            <span className="gauge-value">{value.toFixed(1)}</span>
                            <span className="gauge-unit">{unit}</span>
                        </>
                    ) : (
                        <div className="skeleton" style={{ width: 64, height: 32 }} />
                    )}
                </div>
            </div>

            <div className="sensor-card-range">
                <span>{rangeMin}{unit}</span>
                <span>{rangeMax}{unit}</span>
            </div>
        </div>
    );
}
