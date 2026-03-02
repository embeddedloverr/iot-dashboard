"use client";

import React from "react";

interface HeaderProps {
    lastUpdated: string | null;
    onRefresh: () => void;
    refreshing: boolean;
}

export default function Header({ lastUpdated, onRefresh, refreshing }: HeaderProps) {
    return (
        <header className="header">
            <div>
                <h1 className="header-title">IoT Dashboard</h1>
                <p className="header-subtitle">Real-time temperature & humidity monitoring</p>
            </div>
            <div className="header-actions">
                {lastUpdated && (
                    <span className="header-timestamp">Updated: {lastUpdated}</span>
                )}
                <button onClick={onRefresh} disabled={refreshing} className="refresh-btn">
                    <span className={refreshing ? "spin" : ""}>🔄</span>
                    Refresh
                </button>
            </div>
        </header>
    );
}
