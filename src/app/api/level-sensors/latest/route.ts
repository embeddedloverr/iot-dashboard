import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
    try {
        const db = await getDb();
        const collection = db.collection("watersensordatas");

        // Get the latest reading for each unique mac + node combination
        const pipeline = [
            { $sort: { _id: -1 as const } },
            {
                $group: {
                    _id: { mac: "$mac", node: "$node" },
                    latestDoc: { $first: "$$ROOT" },
                },
            },
            {
                $project: {
                    _id: "$latestDoc._id",
                    mac: "$_id.mac",
                    node: "$_id.node",
                    Dev_type: "$latestDoc.Dev_type",
                    loc: "$latestDoc.loc",
                    client: "$latestDoc.client",
                    d1: "$latestDoc.d1",
                    d2: "$latestDoc.d2",
                    dtime: "$latestDoc.dtime",
                    received_at: "$latestDoc.received_at",
                },
            },
            { $sort: { mac: 1 as const, node: 1 as const } },
        ];

        const readings = await collection.aggregate(pipeline).toArray();

        // Fetch all tank configs to calculate percentages
        const configs = await db
            .collection("level_sensor_config")
            .find({})
            .toArray();

        // Build a lookup map: "MAC|NODE" -> config
        const configMap: Record<string, { alias: string; t1Ref: number; _id: string }> = {};
        for (const cfg of configs) {
            const key = `${cfg.mac}|${cfg.node}`;
            configMap[key] = {
                alias: cfg.alias || "",
                t1Ref: cfg.t1Ref || 0,
                _id: cfg._id.toString(),
            };
        }

        // Enrich readings with percentage and config info
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched = readings.map((r: any) => {
            const key = `${(r.mac || "").toUpperCase()}|${(r.node || "").toUpperCase()}`;
            const config = configMap[key];
            const d1Val = Number(r.d1) || 0;
            const t1Ref = config?.t1Ref || 0;
            const percentage = t1Ref > 0 ? Math.min((d1Val / t1Ref) * 100, 100) : null;

            return {
                ...r,
                d1: d1Val,
                d2: Number(r.d2) || 0,
                alias: config?.alias || "",
                t1Ref,
                configId: config?._id || null,
                percentage: percentage !== null ? Math.round(percentage * 10) / 10 : null,
            };
        });

        return NextResponse.json({ success: true, data: enriched });
    } catch (error) {
        console.error("Error fetching level sensor data:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch level sensor data" },
            { status: 500 }
        );
    }
}
