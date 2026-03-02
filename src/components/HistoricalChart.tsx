"use client";

import React from "react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Area,
    Line,
    ComposedChart,
} from "recharts";

interface HistoryDataPoint {
    ts: string;
    temp_c: number;
    hum_rh: number;
    mac: string;
}

interface HistoricalChartProps {
    data: HistoryDataPoint[];
    range: string;
    onRangeChange: (range: string) => void;
    loading: boolean;
}

const ranges = [
    { value: "1h", label: "1H" },
    { value: "6h", label: "6H" },
    { value: "24h", label: "24H" },
    { value: "7d", label: "7D" },
    { value: "30d", label: "30D" },
];

function formatTimestamp(ts: string): string {
    if (!ts) return "";
    const parts = ts.match(/(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2})/);
    if (!parts) return ts;
    return `${parts[4]}:${parts[5]}`;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload) return null;
    return (
        <div style={{
            background: "rgba(10, 10, 30, 0.95)",
            border: "1px solid rgba(100, 100, 255, 0.2)",
            borderRadius: 12, padding: "12px 16px",
            backdropFilter: "blur(10px)",
        }}>
            <p style={{ color: "#8888bb", fontSize: 12, marginBottom: 8 }}>{label}</p>
            {payload.map((entry, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color }} />
                    <span style={{ color: "#e8e8ff", fontSize: 13, fontWeight: 600 }}>
                        {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}
                        {entry.name === "Temperature" ? "°C" : "%"}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function HistoricalChart({ data, range, onRangeChange, loading }: HistoricalChartProps) {
    const chartData = data.map((d) => ({
        time: formatTimestamp(d.ts),
        fullTime: d.ts,
        Temperature: d.temp_c,
        Humidity: d.hum_rh,
    }));

    return (
        <div className="glass-card chart-card">
            <div className="chart-header">
                <div>
                    <div className="chart-title">📈 Historical Data</div>
                    <div className="chart-subtitle">{data.length} data points</div>
                </div>
                <div className="range-selector">
                    {ranges.map((r) => (
                        <button
                            key={r.value}
                            onClick={() => onRangeChange(r.value)}
                            className={`range-btn ${range === r.value ? "active" : ""}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="chart-container">
                {loading ? (
                    <div className="chart-loading"><div className="chart-spinner" /></div>
                ) : data.length === 0 ? (
                    <div className="chart-empty">No data available for this range</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                            <defs>
                                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="humGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,255,0.06)" />
                            <XAxis dataKey="time" stroke="rgba(100,100,255,0.2)" tick={{ fill: "#8888bb", fontSize: 11 }} interval="preserveStartEnd" />
                            <YAxis yAxisId="temp" stroke="rgba(100,100,255,0.2)" tick={{ fill: "#8888bb", fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "°C", position: "insideTopLeft", fill: "#8888bb", fontSize: 11 }} />
                            <YAxis yAxisId="hum" orientation="right" stroke="rgba(100,100,255,0.2)" tick={{ fill: "#8888bb", fontSize: 11 }} domain={[0, 100]} label={{ value: "%", position: "insideTopRight", fill: "#8888bb", fontSize: 11 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ color: "#8888bb", fontSize: 12, paddingTop: 8 }} />
                            <Area yAxisId="temp" type="monotone" dataKey="Temperature" fill="url(#tempGradient)" stroke="transparent" />
                            <Area yAxisId="hum" type="monotone" dataKey="Humidity" fill="url(#humGradient)" stroke="transparent" />
                            <Line yAxisId="temp" type="monotone" dataKey="Temperature" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "#ef4444", stroke: "white", strokeWidth: 2 }} />
                            <Line yAxisId="hum" type="monotone" dataKey="Humidity" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "#3b82f6", stroke: "white", strokeWidth: 2 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
