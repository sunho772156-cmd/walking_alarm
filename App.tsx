import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import {
  AlarmSession,
  DISTANCE_TARGET_METERS,
  DistanceSource,
  TrackingMode,
  createAlarmSession,
  finishAlarm,
  recordEstimatedWalkingDistance,
  recordVerifiedDistance,
} from './src/domain/alarmSession';
import { simulatedDistanceSource } from './src/domain/distanceSource';

type Screen = 'setup' | 'ringing';

const pad = (value: number) => String(value).padStart(2, '0');

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [testMode, setTestMode] = useState(true);
  const [session, setSession] = useState<AlarmSession | null>(null);

  const mode: TrackingMode = testMode ? 'simulation' : 'sensor';
  const source: DistanceSource = useMemo(() => simulatedDistanceSource, []);
  const progress = session
    ? Math.min(session.verifiedDistance / DISTANCE_TARGET_METERS, 1)
    : 0;

  const startAlarm = () => {
    setSession(createAlarmSession(mode));
    setScreen('ringing');
  };

  const addMovement = (estimated: number, verified: number) => {
    if (!session || session.status !== 'ringing') return;
    let next = recordEstimatedWalkingDistance(session, estimated);
    const result = source.verify({ mode, meters: verified });
    if (result.available) next = recordVerifiedDistance(next, result.meters);
    if (next.verifiedDistance >= DISTANCE_TARGET_METERS) {
      next = finishAlarm(next);
    }
    setSession(next);
  };

  const adjustTime = (part: 'hour' | 'minute', delta: number) => {
    if (part === 'hour') setHour((value) => (value + delta + 24) % 24);
    else setMinute((value) => (value + delta + 60) % 60);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>STEP ALARM · PROTOTYPE</Text>
            <Text style={styles.title}>걸어서 끄는 알람</Text>
          </View>
          <View style={[styles.modeBadge, testMode ? styles.testBadge : styles.sensorBadge]}>
            <Text style={[styles.modeBadgeText, !testMode && styles.sensorText]}>
              {testMode ? '가상 테스트' : '센서 미연결'}
            </Text>
          </View>
        </View>

        <View style={styles.modeCard}>
          <View style={styles.modeCopy}>
            <Text style={styles.cardTitle}>이동 테스트 모드</Text>
            <Text style={styles.secondaryText}>
              {testMode
                ? '가상 데이터로 화면을 체험합니다.'
                : '실제 센서가 없어 추적을 검증할 수 없습니다.'}
            </Text>
          </View>
          <Switch
            value={testMode}
            onValueChange={setTestMode}
            trackColor={{ false: '#CBD5E1', true: '#A5B4FC' }}
            thumbColor={testMode ? '#4F46E5' : '#F8FAFC'}
            accessibilityLabel="가상 이동 테스트 모드"
          />
        </View>

        {screen === 'setup' ? (
          <>
            <View style={styles.timeCard}>
              <Text style={styles.sectionLabel}>알람 시간</Text>
              <View style={styles.timePicker}>
                <TimeStepper value={hour} onChange={(delta) => adjustTime('hour', delta)} />
                <Text style={styles.colon}>:</Text>
                <TimeStepper value={minute} onChange={(delta) => adjustTime('minute', delta)} />
              </View>
              <Text style={styles.helperText}>예정된 알람 · 매일</Text>
            </View>

            <View style={styles.goalCard}>
              <View style={styles.goalIcon}><Text style={styles.goalEmoji}>↗</Text></View>
              <View style={styles.goalCopy}>
                <Text style={styles.goalTitle}>알람 종료 목표</Text>
                <Text style={styles.secondaryText}>누적 이동 거리</Text>
              </View>
              <Text style={styles.goalValue}>10<Text style={styles.goalUnit}> m</Text></Text>
            </View>

            <View style={styles.notice}>
              <Text style={styles.noticeIcon}>ⓘ</Text>
              <Text style={styles.noticeText}>
                왕복 이동도 누적됩니다. 제자리걸음이나 흔들기는 실제 위치 검증 없이는 거리로 인정할 수 없어요.
              </Text>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={startAlarm}>
              <Text style={styles.primaryButtonText}>알람 미리보기</Text>
              <Text style={styles.buttonArrow}>→</Text>
            </TouchableOpacity>
            <Text style={styles.footerNote}>프로토타입 · 아직 알람 예약 기능은 연결되지 않았어요</Text>
          </>
        ) : (
          <>
            <View style={styles.ringingCard}>
              <View style={styles.ringIcon}><Text style={styles.ringEmoji}>◖</Text></View>
              <Text style={styles.ringingLabel}>알람이 울리고 있어요</Text>
              <Text style={styles.ringingTime}>{pad(hour)}:{pad(minute)}</Text>
              <Text style={styles.secondaryText}>목표까지 {Math.max(0, DISTANCE_TARGET_METERS - (session?.verifiedDistance ?? 0)).toFixed(1)}m 남았어요</Text>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressDistance}>{(session?.verifiedDistance ?? 0).toFixed(1)} m</Text>
                <Text style={styles.progressTarget}>목표 {DISTANCE_TARGET_METERS} m</Text>
              </View>

              <View style={styles.statRow}>
                <Stat label="보행 추정" value={`${(session?.estimatedWalkingDistance ?? 0).toFixed(1)} m`} />
                <View style={styles.statDivider} />
                <Stat label="검증 거리" value={`${(session?.verifiedDistance ?? 0).toFixed(1)} m`} verified />
              </View>
            </View>

            <View style={styles.statusCard}>
              <View style={[styles.statusDot, testMode ? styles.dotGreen : styles.dotAmber]} />
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>{testMode ? '가상 테스트 데이터 사용 중' : '위치 검증 불가'}</Text>
                <Text style={styles.statusDescription}>
                  {testMode ? '아래 버튼은 시연용입니다. 실제 이동 기록이 아닙니다.' : '센서 연결 전까지 이동을 검증 거리로 인정하지 않습니다.'}
                </Text>
              </View>
            </View>

            {testMode && session?.status === 'ringing' && (
              <View style={styles.simulatorCard}>
                <View style={styles.simulatorHeader}>
                  <Text style={styles.simulatorTitle}>가상 이동 입력</Text>
                  <Text style={styles.simulatorTag}>TEST ONLY</Text>
                </View>
                <Text style={styles.secondaryText}>시연 데이터이며 실제 보행이나 위치 검증 결과가 아닙니다.</Text>
                <View style={styles.simulatorButtons}>
                  <SimButton label="제자리걸음" detail="추정 +2m · 검증 0m" onPress={() => addMovement(2, 0)} />
                  <SimButton label="가상으로 4m 이동" detail="추정 +4m · 검증 +4m" onPress={() => addMovement(4, 4)} />
                  <SimButton label="가상으로 6m 이동" detail="추정 +6m · 검증 +6m" onPress={() => addMovement(6, 6)} />
                </View>
              </View>
            )}

            {session?.status === 'completed' ? (
              <View style={styles.completedCard}>
                <Text style={styles.completedIcon}>✓</Text>
                <View style={styles.goalCopy}>
                  <Text style={styles.completedTitle}>목표 달성!</Text>
                  <Text style={styles.secondaryText}>검증 이동 거리가 10m에 도달했어요.</Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('setup')}>
                <Text style={styles.secondaryButtonText}>알람 설정으로 돌아가기</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.footerNote}>시연은 실제 알람을 예약하거나 센서를 사용하지 않아요</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TimeStepper({ value, onChange }: { value: number; onChange: (delta: number) => void }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepButton} onPress={() => onChange(1)} accessibilityLabel="시간 올리기">
        <Text style={styles.stepButtonText}>⌃</Text>
      </TouchableOpacity>
      <Text style={styles.timeValue}>{pad(value)}</Text>
      <TouchableOpacity style={styles.stepButton} onPress={() => onChange(-1)} accessibilityLabel="시간 내리기">
        <Text style={styles.stepButtonText}>⌄</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, value, verified = false }: { label: string; value: string; verified?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, verified && styles.verifiedValue]}>{value}</Text>
    </View>
  );
}

function SimButton({ label, detail, onPress }: { label: string; detail: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.simButton} onPress={onPress}>
      <Text style={styles.simButtonLabel}>{label}</Text>
      <Text style={styles.simButtonDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F8FC' },
  container: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 34, maxWidth: 560, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  eyebrow: { color: '#8186A0', fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 7 },
  title: { color: '#171A2E', fontSize: 24, fontWeight: '800', letterSpacing: -0.7 },
  modeBadge: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20 },
  testBadge: { backgroundColor: '#E9E8FF' },
  sensorBadge: { backgroundColor: '#FFF1D9' },
  modeBadgeText: { color: '#5147CC', fontSize: 11, fontWeight: '800' },
  sensorText: { color: '#9A5C11' },
  modeCard: { backgroundColor: '#FFF', borderRadius: 17, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17, borderWidth: 1, borderColor: '#EEF0F6' },
  modeCopy: { flex: 1, paddingRight: 10 },
  cardTitle: { color: '#232640', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  secondaryText: { color: '#85899D', fontSize: 12, lineHeight: 18 },
  timeCard: { backgroundColor: '#FFF', borderRadius: 22, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#EEF0F6' },
  sectionLabel: { color: '#73788E', fontSize: 13, fontWeight: '700' },
  timePicker: { flexDirection: 'row', alignItems: 'center', marginTop: 13, marginBottom: 7 },
  stepper: { alignItems: 'center', width: 80 },
  stepButton: { width: 46, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepButtonText: { color: '#8589A0', fontSize: 23, fontWeight: '500', lineHeight: 26 },
  timeValue: { color: '#171A2E', fontSize: 58, lineHeight: 70, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  colon: { color: '#C7CAD6', fontSize: 49, fontWeight: '600', marginHorizontal: 3, marginBottom: 2 },
  helperText: { color: '#A1A5B5', fontSize: 11, marginTop: 5 },
  goalCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 17, marginTop: 14, borderWidth: 1, borderColor: '#EEF0F6' },
  goalIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: '#EEEDFF', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  goalEmoji: { color: '#5A50D5', fontSize: 25, fontWeight: '700' },
  goalCopy: { flex: 1 },
  goalTitle: { color: '#282B42', fontWeight: '700', fontSize: 14, marginBottom: 4 },
  goalValue: { color: '#5147D0', fontSize: 25, fontWeight: '800' },
  goalUnit: { fontSize: 14, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F0F3FF', borderRadius: 13, padding: 13, marginTop: 14 },
  noticeIcon: { color: '#5D63B8', marginRight: 9, fontSize: 15, fontWeight: '700' },
  noticeText: { color: '#626884', fontSize: 11, lineHeight: 17, flex: 1 },
  primaryButton: { height: 56, borderRadius: 16, backgroundColor: '#5147D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, shadowColor: '#5147D0', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  primaryButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  buttonArrow: { color: '#DCD9FF', fontSize: 19, marginLeft: 10 },
  footerNote: { textAlign: 'center', color: '#A3A7B5', fontSize: 10, lineHeight: 16, marginTop: 14, paddingHorizontal: 10 },
  ringingCard: { backgroundColor: '#FFF', borderRadius: 22, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: '#EEF0F6' },
  ringIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#FFF0EF', alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  ringEmoji: { color: '#E66D67', fontSize: 29, fontWeight: '900' },
  ringingLabel: { color: '#777B90', fontSize: 13, fontWeight: '700' },
  ringingTime: { color: '#171A2E', fontSize: 48, fontWeight: '800', letterSpacing: -1.5, marginVertical: 5 },
  progressTrack: { height: 12, backgroundColor: '#E9EAF2', borderRadius: 8, width: '100%', marginTop: 25, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#5C51D7', borderRadius: 8 },
  progressLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  progressDistance: { color: '#5147D0', fontSize: 17, fontWeight: '800' },
  progressTarget: { color: '#9296A8', fontSize: 12, marginTop: 3 },
  statRow: { flexDirection: 'row', width: '100%', backgroundColor: '#F8F8FC', borderRadius: 14, paddingVertical: 15, marginTop: 20 },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#E4E5ED' },
  statLabel: { color: '#9296A8', fontSize: 11, marginBottom: 5 },
  statValue: { color: '#686D84', fontSize: 16, fontWeight: '700' },
  verifiedValue: { color: '#5147D0' },
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: '#EEF0F6', padding: 15, marginTop: 14 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 12 },
  dotGreen: { backgroundColor: '#38A879' },
  dotAmber: { backgroundColor: '#E4A137' },
  statusCopy: { flex: 1 },
  statusTitle: { color: '#303349', fontWeight: '700', fontSize: 12, marginBottom: 3 },
  statusDescription: { color: '#8B8FA2', fontSize: 10, lineHeight: 15 },
  simulatorCard: { backgroundColor: '#FFF', borderRadius: 17, borderWidth: 1, borderColor: '#E6E5FC', padding: 16, marginTop: 14 },
  simulatorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  simulatorTitle: { color: '#282B42', fontSize: 14, fontWeight: '800' },
  simulatorTag: { color: '#6259D5', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  simulatorButtons: { marginTop: 10, gap: 8 },
  simButton: { backgroundColor: '#F6F5FF', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simButtonLabel: { color: '#4039A8', fontSize: 12, fontWeight: '700' },
  simButtonDetail: { color: '#7772BA', fontSize: 10 },
  secondaryButton: { height: 51, borderRadius: 15, borderWidth: 1, borderColor: '#DADBE7', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  secondaryButtonText: { color: '#666B80', fontSize: 13, fontWeight: '700' },
  completedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF8F1', borderRadius: 16, padding: 16, marginTop: 16 },
  completedIcon: { color: '#268B60', backgroundColor: '#D2F0E0', borderRadius: 14, overflow: 'hidden', width: 40, height: 40, textAlign: 'center', textAlignVertical: 'center', fontSize: 22, fontWeight: '800', marginRight: 12 },
  completedTitle: { color: '#267451', fontWeight: '800', fontSize: 14, marginBottom: 4 },
});
