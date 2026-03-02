"use client";

import React from "react";

interface StatsGridProps {
    temperature: { avg: number; min: number; max: number } | null;
    humidity: { avg: number; min: number; max: number } | null;
    totalReadings: number;
    range: string;
}

function StatCard({ label, value, unit, icon, color }: {
    label: string; value: number | null; unit: string; icon: string; color: string;
}) {
    return (
        <div className="glass-card stat-card">
            <div className="stat-card-header">
                <span className="stat-icon">{icon}</span>
                <span className="stat-label">{label}</span>
            </div>
            <div className="stat-card-value">
                <span className="value" style={{ color }}>{value !== null ? value.toFixed(1) : "—"}</span>
                <span className="unit">{unit}</span>
            </div>
        </div>
    );
}

export default function StatsGrid({ temperature, humidity, totalReadings, range }: StatsGridProps) {
    return (
        <div className="section-gap">
            <div className="stats-section-header">
                <h3 className="stats-section-title">Statistics</h3>
                <span className="stats-range-badge">Last {range}</span>
            </div>
            <div className="stats-grid">
                <StatCard label="Avg Temp" value={temperature?.avg ?? null} unit="°C" icon="🌡️" color="var(--accent-orange)" />
                <StatCard label="Min Temp" value={temperature?.min ?? null} unit="°C" icon="❄️" color="var(--accent-cyan)" />
                <StatCard label="Max Temp" value={temperature?.max ?? null} unit="°C" icon="🔥" color="var(--accent-red)" />
                <StatCard label="Avg Humidity" value={humidity?.avg ?? null} unit="%" icon="💧" color="var(--accent-blue)" />
                <StatCard label="Min Humidity" value={humidity?.min ?? null} unit="%" icon="🏜️" color="var(--accent-green)" />
                <StatCard label="Max Humidity" value={humidity?.max ?? null} unit="%" icon="🌊" color="#818cf8" />
            </div>
            <div className="stats-footer">Based on {totalReadings.toLocaleString()} readings</div>
        </div>
    );
}
