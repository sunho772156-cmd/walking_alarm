export type TrackingMode = 'simulation' | 'sensor';

export interface VerificationInput {
  mode: TrackingMode;
  meters: number;
}

export interface VerificationResult {
  available: boolean;
  meters: number;
  reason?: 'sensor_not_connected' | 'invalid_distance';
}

/** Adapter boundary for future indoor movement verification.
 * A future sensor implementation must return unavailable when it cannot verify a
 * real-world position change. Pedestrian inference alone must never satisfy it.
 */
export interface DistanceSource {
  verify(input: VerificationInput): VerificationResult;
}

/** Explicitly a demo source: its values are simulated and must not be presented
 * as measurements from a device or real location.
 */
export const simulatedDistanceSource: DistanceSource = {
  verify({ mode, meters }) {
    if (mode !== 'simulation') {
      return { available: false, meters: 0, reason: 'sensor_not_connected' };
    }
    if (!Number.isFinite(meters) || meters < 0) {
      return { available: false, meters: 0, reason: 'invalid_distance' };
    }
    return { available: true, meters };
  },
};

/** Placeholder for a real source. Real sensor integration is intentionally absent. */
export const unavailableSensorDistanceSource: DistanceSource = {
  verify() {
    return { available: false, meters: 0, reason: 'sensor_not_connected' };
  },
};
