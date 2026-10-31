import type { TrackingMode } from './distanceSource';

export const DISTANCE_TARGET_METERS = 10;

export type AlarmStatus = 'ringing' | 'completed';

export interface AlarmSession {
  mode: TrackingMode;
  status: AlarmStatus;
  estimatedWalkingDistance: number;
  verifiedDistance: number;
}

export function createAlarmSession(mode: TrackingMode): AlarmSession {
  return { mode, status: 'ringing', estimatedWalkingDistance: 0, verifiedDistance: 0 };
}

export function recordEstimatedWalkingDistance(session: AlarmSession, meters: number): AlarmSession {
  if (session.status !== 'ringing' || !Number.isFinite(meters) || meters <= 0) return session;
  return { ...session, estimatedWalkingDistance: session.estimatedWalkingDistance + meters };
}

export function recordVerifiedDistance(session: AlarmSession, meters: number): AlarmSession {
  if (session.status !== 'ringing' || !Number.isFinite(meters) || meters <= 0) return session;
  return { ...session, verifiedDistance: session.verifiedDistance + meters };
}

export function finishAlarm(session: AlarmSession): AlarmSession {
  if (session.status !== 'ringing' || session.verifiedDistance < DISTANCE_TARGET_METERS) return session;
  return { ...session, status: 'completed' };
}
