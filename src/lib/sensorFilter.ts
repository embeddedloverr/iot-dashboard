/**
 * Sensor Data Outlier/Spike Filter
 *
 * Uses a two-layer approach:
 * 1. Physical bounds — hard reject readings outside physically possible ranges
 * 2. IQR (Interquartile Range) — statistical outlier detection that adapts to each device's data
 *
 * IQR method: values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR] are considered outliers.
 * This is robust against the outliers themselves, unlike mean/stddev approaches.
 */

// --- Physical bounds (safety net) ---

const TEMP_MIN = -20;  // °C — below this is physically impossible for these sensors
const TEMP_MAX = 70;   // °C — above this is physically impossible for these sensors
const HUM_MIN = 0;     // %
const HUM_MAX = 100;   // %

/**
 * Check if a single reading is within physically possible bounds.
 */
export function isPhysicallyValid(
    temp: number | null | undefined,
    humidity: number | null | undefined
): boolean {
    if (temp !== null && temp !== undefined) {
        if (typeof temp !== "number" || isNaN(temp)) return false;
        if (temp < TEMP_MIN || temp > TEMP_MAX) return false;
    }
    if (humidity !== null && humidity !== undefined) {
        if (typeof humidity !== "number" || isNaN(humidity)) return false;
        if (humidity < HUM_MIN || humidity > HUM_MAX) return false;
    }
    return true;
}

// --- IQR-based outlier detection ---

/**
 * Compute IQR bounds for an array of numeric values.
 * Returns [lowerBound, upperBound] — values outside this range are outliers.
 *
 * @param values - Array of numeric values (must have at least 4 values for meaningful IQR)
 * @param multiplier - IQR multiplier (default: 1.5, standard Tukey fence)
 */
export function computeIQRBounds(
    values: number[],
    multiplier: number = 1.5
): { lower: number; upper: number } | null {
    if (values.length < 4) return null; // Not enough data for meaningful IQR

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // Q1 = median of lower half, Q3 = median of upper half
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    return {
        lower: q1 - multiplier * iqr,
        upper: q3 + multiplier * iqr,
    };
}

/**
 * Filter an array of readings, removing outliers based on IQR for both temp and humidity.
 * First applies physical bounds, then IQR filtering.
 *
 * @param readings - Array of objects with temp and humidity fields
 * @param tempField - Key name for temperature (default: "temp_c")
 * @param humField - Key name for humidity (default: "hum_rh")
 * @returns Filtered array with outliers removed
 */
export function filterReadings<T extends Record<string, unknown>>(
    readings: T[],
    tempField: string = "temp_c",
    humField: string = "hum_rh"
): T[] {
    if (readings.length === 0) return readings;

    // Step 1: Remove physically impossible values
    let filtered = readings.filter((r) =>
        isPhysicallyValid(r[tempField] as number, r[humField] as number)
    );

    if (filtered.length < 4) return filtered; // Not enough data for IQR

    // Step 2: Compute IQR bounds for temperature
    const tempValues = filtered
        .map((r) => r[tempField] as number)
        .filter((v) => typeof v === "number" && !isNaN(v));

    const tempBounds = computeIQRBounds(tempValues);

    // Step 3: Compute IQR bounds for humidity
    const humValues = filtered
        .map((r) => r[humField] as number)
        .filter((v) => typeof v === "number" && !isNaN(v));

    const humBounds = computeIQRBounds(humValues);

    // Step 4: Filter using IQR bounds
    filtered = filtered.filter((r) => {
        const temp = r[tempField] as number;
        const hum = r[humField] as number;

        if (tempBounds && typeof temp === "number" && !isNaN(temp)) {
            if (temp < tempBounds.lower || temp > tempBounds.upper) return false;
        }
        if (humBounds && typeof hum === "number" && !isNaN(hum)) {
            if (hum < humBounds.lower || hum > humBounds.upper) return false;
        }
        return true;
    });

    return filtered;
}

/**
 * Validate a single reading against recent history for the same device.
 * Used by the "latest" and "alerts" APIs to check if the current reading is an outlier.
 *
 * @param currentTemp - The temperature value to validate
 * @param currentHum - The humidity value to validate
 * @param recentTemps - Recent temperature values from the same device
 * @param recentHums - Recent humidity values from the same device
 * @returns { valid: boolean, reason?: string }
 */
export function validateSingleReading(
    currentTemp: number | null | undefined,
    currentHum: number | null | undefined,
    recentTemps: number[],
    recentHums: number[]
): { valid: boolean; reason?: string } {
    // Check physical bounds first
    if (!isPhysicallyValid(currentTemp, currentHum)) {
        return {
            valid: false,
            reason: `Physical bounds exceeded: temp=${currentTemp}, hum=${currentHum}`,
        };
    }

    // Check temperature against IQR of recent history
    if (currentTemp !== null && currentTemp !== undefined && recentTemps.length >= 4) {
        const tempBounds = computeIQRBounds(recentTemps);
        if (tempBounds && (currentTemp < tempBounds.lower || currentTemp > tempBounds.upper)) {
            return {
                valid: false,
                reason: `Temp spike detected: ${currentTemp}°C outside IQR bounds [${tempBounds.lower.toFixed(1)}, ${tempBounds.upper.toFixed(1)}]`,
            };
        }
    }

    // Check humidity against IQR of recent history
    if (currentHum !== null && currentHum !== undefined && recentHums.length >= 4) {
        const humBounds = computeIQRBounds(recentHums);
        if (humBounds && (currentHum < humBounds.lower || currentHum > humBounds.upper)) {
            return {
                valid: false,
                reason: `Humidity spike detected: ${currentHum}% outside IQR bounds [${humBounds.lower.toFixed(1)}, ${humBounds.upper.toFixed(1)}]`,
            };
        }
    }

    return { valid: true };
}

/**
 * MongoDB aggregation pipeline stages to fetch recent readings for a device.
 * Returns the pipeline stages to get the last N readings for IQR baseline.
 */
export function recentReadingsPipeline(mac: string, limit: number = 20) {
    return [
        { $match: { topic: "smartdwell/sensor/temp", "json.mac": mac } },
        { $sort: { _id: -1 } },
        { $limit: limit },
        {
            $project: {
                _id: 0,
                temp_c: "$json.temp_c",
                hum_rh: "$json.hum_rh",
            },
        },
    ];
}
