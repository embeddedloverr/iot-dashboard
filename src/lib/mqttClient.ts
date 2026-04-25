import mqtt from "mqtt";

const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";

/**
 * Publish an MQTT message and disconnect.
 * Used for relay control commands.
 *
 * Topic format: smartdwell/{MAC}/relay/set
 * Payload format: {"relay": N, "state": 0|1}
 */
export async function mqttPublish(
    topic: string,
    payload: string | object
): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
        const options: mqtt.IClientOptions = {
            connectTimeout: 10000,
            clean: true,
        };
        if (MQTT_USERNAME) options.username = MQTT_USERNAME;
        if (MQTT_PASSWORD) options.password = MQTT_PASSWORD;

        const client = mqtt.connect(MQTT_BROKER, options);
        const timeout = setTimeout(() => {
            client.end(true);
            resolve({ success: false, error: "MQTT connection timeout (10s)" });
        }, 10000);

        client.on("connect", () => {
            const msg = typeof payload === "string" ? payload : JSON.stringify(payload);
            client.publish(topic, msg, { qos: 1 }, (err) => {
                clearTimeout(timeout);
                client.end();
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    resolve({ success: true });
                }
            });
        });

        client.on("error", (err) => {
            clearTimeout(timeout);
            client.end(true);
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * Build the MQTT topic for relay control.
 * Format: smartdwell/{MAC}/relay/set
 */
export function buildRelayTopic(mac: string): string {
    // Normalize MAC: remove colons for topic format if needed,
    // but keep as-is since the user's format uses colons in topics
    return `smartdwell/${mac}/relay/set`;
}

/**
 * Build the relay control payload.
 * Format: {"relay": channelNumber, "state": 0|1}
 */
export function buildRelayPayload(channel: number, action: "ON" | "OFF"): object {
    return {
        relay: channel,
        state: action === "ON" ? 1 : 0,
    };
}
