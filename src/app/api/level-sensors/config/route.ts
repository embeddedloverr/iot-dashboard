import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

// GET: Retrieve all level sensor tank configurations
export async function GET() {
    try {
        const db = await getDb();
        const configs = await db
            .collection("level_sensor_config")
            .find({})
            .sort({ mac: 1, node: 1 })
            .toArray();

        return NextResponse.json({ success: true, data: configs });
    } catch (error) {
        console.error("Error fetching level sensor configs:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch level sensor configs" },
            { status: 500 }
        );
    }
}

// POST: Create or update a tank configuration
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { _id, mac, node, alias, t1Ref } = body;

        if (!mac || !node) {
            return NextResponse.json(
                { success: false, error: "mac and node are required" },
                { status: 400 }
            );
        }

        if (!t1Ref || Number(t1Ref) <= 0) {
            return NextResponse.json(
                { success: false, error: "t1Ref must be a positive number" },
                { status: 400 }
            );
        }

        const db = await getDb();
        const collection = db.collection("level_sensor_config");

        if (_id) {
            // Update existing
            await collection.updateOne(
                { _id: new ObjectId(_id) },
                {
                    $set: {
                        mac: mac.toUpperCase(),
                        node: node.toUpperCase(),
                        alias: alias || "",
                        t1Ref: Number(t1Ref),
                        updatedAt: new Date(),
                    },
                }
            );
            return NextResponse.json({
                success: true,
                message: `Tank config updated for ${mac} / ${node}`,
            });
        } else {
            // Check for duplicate mac+node
            const existing = await collection.findOne({
                mac: mac.toUpperCase(),
                node: node.toUpperCase(),
            });

            if (existing) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `Tank ${node} on MAC ${mac} already configured. Edit it instead.`,
                    },
                    { status: 400 }
                );
            }

            // Create new
            await collection.insertOne({
                mac: mac.toUpperCase(),
                node: node.toUpperCase(),
                alias: alias || "",
                t1Ref: Number(t1Ref),
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            return NextResponse.json({
                success: true,
                message: `Tank config created for ${mac} / ${node}`,
            });
        }
    } catch (error) {
        console.error("Error saving level sensor config:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save level sensor config" },
            { status: 500 }
        );
    }
}

// DELETE: Remove a tank configuration
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "id is required" },
                { status: 400 }
            );
        }

        const db = await getDb();
        await db
            .collection("level_sensor_config")
            .deleteOne({ _id: new ObjectId(id) });

        return NextResponse.json({
            success: true,
            message: "Tank config deleted",
        });
    } catch (error) {
        console.error("Error deleting level sensor config:", error);
        return NextResponse.json(
            { success: false, error: "Failed to delete level sensor config" },
            { status: 500 }
        );
    }
}
