import type { TrackingMode } from './distanceSource';

export const DISTANCE_TARGET_METERS = 10;

export type AlarmStatus = 'ringing' | 'completed';

export interface AlarmSession {
  mode: TrackingMode;
  status: AlarmStatus;
  targetDistance: number;
  estimatedWalkingDistance: number;
  estimatedSteps: number;
  verifiedDistance: number;
}

export function createAlarmSession(mode: TrackingMode, targetDistance = DISTANCE_TARGET_METERS): AlarmSession {
  return {
    mode,
    status: 'ringing',
    targetDistance: Math.max(7, Number.isFinite(targetDistance) ? targetDistance : DISTANCE_TARGET_METERS),
    estimatedWalkingDistance: 0,
    estimatedSteps: 0,
    verifiedDistance: 0,
  };
}

export function recordEstimatedWalkingDistance(session: AlarmSession, meters: number, steps = 0): AlarmSession {
  if (session.status !== 'ringing' || !Number.isFinite(meters) || meters < 0 || !Number.isFinite(steps) || steps < 0) return session;
  return {
    ...session,
    estimatedWalkingDistance: session.estimatedWalkingDistance + meters,
    estimatedSteps: session.estimatedSteps + steps,
  };
}

export function recordVerifiedDistance(session: AlarmSession, meters: number): AlarmSession {
  if (session.status !== 'ringing' || !Number.isFinite(meters) || meters <= 0) return session;
  return { ...session, verifiedDistance: session.verifiedDistance + meters };
}

export function finishAlarm(session: AlarmSession): AlarmSession {
  if (session.status !== 'ringing' || session.verifiedDistance < session.targetDistance) return session;
  return { ...session, status: 'completed' };
}
