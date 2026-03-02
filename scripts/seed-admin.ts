// Seed script: creates the initial superadmin user
// Run with: npx tsx scripts/seed-admin.ts

import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "smartdwell";

async function seed() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB);

    const existing = await db.collection("users").findOne({ username: "admin" });
    if (existing) {
        console.log("⚠️  Admin user already exists. Skipping seed.");
        await client.close();
        return;
    }

    const hashedPassword = await bcrypt.hash("admin123", 12);

    await db.collection("users").insertOne({
        username: "admin",
        password: hashedPassword,
        role: "superadmin",
        devices: [], // empty = all devices
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // Create unique index on username
    await db.collection("users").createIndex({ username: 1 }, { unique: true });

    console.log("✅ Superadmin user created!");
    console.log("   Username: admin");
    console.log("   Password: admin123");
    console.log("   ⚠️  Change this password after first login!");

    await client.close();
}

seed().catch(console.error);
