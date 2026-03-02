"use client";

import React, { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import DeviceCard from "@/components/DeviceCard";
import HistoricalChart from "@/components/HistoricalChart";
import StatsGrid from "@/components/StatsGrid";
import DeviceSelector from "@/components/DeviceSelector";
import AlertConfigPanel from "@/components/AlertConfig";

interface SensorReading {
  mac: string; temp_c: number; hum_rh: number; rssi: number; ssid: string; ts: string; mongoTs?: string;
}
interface HistoryPoint {
  ts: string; temp_c: number; hum_rh: number; mac: string;
}
interface StatsData {
  temperature: { avg: number; min: number; max: number };
  humidity: { avg: number; min: number; max: number };
  totalReadings: number;
}
interface Device {
  mac: string; ssid: string; lastSeen: string; count: number;
}

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [latestReadings, setLatestReadings] = useState<SensorReading[]>([]);
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedMac, setSelectedMac] = useState("");
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});

  const fetchAliases = useCallback(async () => {
    try {
      const res = await fetch("/api/devices/aliases");
      const data = await res.json();
      if (data.success) setAliases(data.data);
    } catch (err) { console.error("Failed to fetch aliases:", err); }
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/sensor/latest");
      const data = await res.json();
      if (data.success) { setLatestReadings(data.data); setLastUpdated(new Date().toLocaleTimeString()); }
    } catch (err) { console.error("Failed to fetch latest:", err); }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ range });
      if (selectedMac) params.set("mac", selectedMac);
      const res = await fetch(`/api/sensor/history?${params}`);
      const data = await res.json();
      if (data.success) setHistoryData(data.data);
    } catch (err) { console.error("Failed to fetch history:", err); }
    finally { setHistoryLoading(false); }
  }, [range, selectedMac]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams({ range });
      if (selectedMac) params.set("mac", selectedMac);
      const res = await fetch(`/api/sensor/stats?${params}`);
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (err) { console.error("Failed to fetch stats:", err); }
  }, [range, selectedMac]);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/sensor/devices");
      const data = await res.json();
      if (data.success) setDevices(data.data);
    } catch (err) { console.error("Failed to fetch devices:", err); }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchLatest(), fetchDevices(), fetchAliases()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchLatest, fetchDevices, fetchAliases]);

  useEffect(() => { fetchHistory(); fetchStats(); }, [fetchHistory, fetchStats]);
  useEffect(() => { const i = setInterval(fetchLatest, 30000); return () => clearInterval(i); }, [fetchLatest]);
  useEffect(() => { const i = setInterval(() => { fetch("/api/alerts/check").catch(console.error); }, 120000); return () => clearInterval(i); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLatest(), fetchHistory(), fetchStats(), fetchDevices(), fetchAliases()]);
    setRefreshing(false);
  };

  const displayedReadings = selectedMac
    ? latestReadings.filter((r) => r.mac === selectedMac)
    : latestReadings;

  return (
    <div className="app-layout">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="main-content">
        <Header lastUpdated={lastUpdated} onRefresh={handleRefresh} refreshing={refreshing} />

        {activeSection === "dashboard" && (
          <>
            <div className="section-label">
              <h2>📡 Sensor Devices</h2>
              {latestReadings.length > 0 && (
                <span className="device-count">{latestReadings.length} online</span>
              )}
            </div>

            {loading ? (
              <div className="device-cards-grid">
                <div className="glass-card skeleton skeleton-card" />
                <div className="glass-card skeleton skeleton-card" />
                <div className="glass-card skeleton skeleton-card" />
              </div>
            ) : displayedReadings.length === 0 ? (
              <div className="glass-card empty-state">
                <span className="empty-icon">📡</span>
                <p className="empty-title">No sensor data found</p>
                <p className="empty-text">Make sure MongoDB is running and has data in mqtt_packets</p>
              </div>
            ) : (
              <div className="device-cards-grid">
                {displayedReadings.map((reading) => (
                  <DeviceCard
                    key={reading.mac}
                    mac={reading.mac}
                    alias={aliases[reading.mac]}
                    temp_c={reading.temp_c}
                    hum_rh={reading.hum_rh}
                    rssi={reading.rssi}
                    ssid={reading.ssid}
                    ts={reading.ts}
                    mongoTs={reading.mongoTs}
                    selected={selectedMac === reading.mac}
                    onClick={() => setSelectedMac(selectedMac === reading.mac ? "" : reading.mac)}
                  />
                ))}
              </div>
            )}

            <StatsGrid
              temperature={stats?.temperature ?? null}
              humidity={stats?.humidity ?? null}
              totalReadings={stats?.totalReadings ?? 0}
              range={range}
            />

            <DeviceSelector devices={devices} aliases={aliases} selectedMac={selectedMac} onSelect={setSelectedMac} />
            <div className="section-gap" style={{ width: '100%', height: '400px' }}>
              <HistoricalChart data={historyData} range={range} onRangeChange={setRange} loading={historyLoading} />
            </div>
          </>
        )}

        {activeSection === "alerts" && (
          <AlertConfigPanel
            devices={devices.map((d) => ({ mac: d.mac, alias: aliases[d.mac] || "" }))}
            aliases={aliases}
            onAliasUpdate={fetchAliases}
          />
        )}

        <footer className="dashboard-footer">
          Designed by <span className="brand">Smartdwell Technologies</span> · IoT Monitoring Dashboard
        </footer>
      </main>
    </div>
  );
}
