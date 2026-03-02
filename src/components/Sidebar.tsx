"use client";

import React, { useState } from "react";

interface SidebarProps {
    activeSection: string;
    onSectionChange: (section: string) => void;
}

const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "alerts", label: "Alerts", icon: "🔔" },
];

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            <button
                className="mobile-menu-btn"
                onClick={() => setMobileOpen(!mobileOpen)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">🌡️</div>
                    <div className="sidebar-logo-text">
                        <h1>SmartDwell</h1>
                        <p>IoT Monitor</p>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                onSectionChange(item.id);
                                setMobileOpen(false);
                            }}
                            className={`sidebar-nav-item ${activeSection === item.id ? "active" : ""}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </aside>
        </>
    );
}
