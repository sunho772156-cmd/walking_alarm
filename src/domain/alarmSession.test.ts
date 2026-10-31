import {
  createAlarmSession,
  finishAlarm,
  recordEstimatedWalkingDistance,
  recordVerifiedDistance,
} from './alarmSession';
import { simulatedDistanceSource, unavailableSensorDistanceSource } from './distanceSource';

describe('alarm movement session', () => {
  it('keeps estimated walking distance separate from verified distance', () => {
    const session = recordEstimatedWalkingDistance(createAlarmSession('simulation'), 8);
    expect(session.estimatedWalkingDistance).toBe(8);
    expect(session.verifiedDistance).toBe(0);
    expect(finishAlarm(session).status).toBe('ringing');
  });

  it('counts returned trips cumulatively when a source verifies each segment', () => {
    const first = simulatedDistanceSource.verify({ mode: 'simulation', meters: 5 });
    const second = simulatedDistanceSource.verify({ mode: 'simulation', meters: 5 });
    const session = recordVerifiedDistance(
      recordVerifiedDistance(createAlarmSession('simulation'), first.meters),
      second.meters,
    );
    expect(session.verifiedDistance).toBe(10);
    expect(finishAlarm(session).status).toBe('completed');
  });

  it('does not count estimated-only movement toward the alarm target', () => {
    const session = recordEstimatedWalkingDistance(createAlarmSession('sensor'), 30);
    expect(finishAlarm(session).status).toBe('ringing');
  });

  it('does not credit movement while real sensor verification is unavailable', () => {
    const result = unavailableSensorDistanceSource.verify({ mode: 'sensor', meters: 20 });
    const session = recordVerifiedDistance(createAlarmSession('sensor'), result.meters);
    expect(result.available).toBe(false);
    expect(session.verifiedDistance).toBe(0);
    expect(finishAlarm(session).status).toBe('ringing');
  });

  it('ignores negative, non-finite and post-completion movement', () => {
    const base = createAlarmSession('simulation');
    expect(recordVerifiedDistance(base, -1)).toBe(base);
    expect(recordVerifiedDistance(base, Number.NaN)).toBe(base);
    const completed = finishAlarm(recordVerifiedDistance(base, 10));
    expect(recordVerifiedDistance(completed, 5).verifiedDistance).toBe(10);
  });
});
