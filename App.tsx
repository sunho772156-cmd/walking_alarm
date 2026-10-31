import React, { useMemo, useState } from 'react';
import {
  PanResponder,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import {
  AlarmSession,
  DistanceSource,
  TrackingMode,
  createAlarmSession,
  finishAlarm,
  recordEstimatedWalkingDistance,
  recordVerifiedDistance,
} from './src/domain/alarmSession';
import { simulatedDistanceSource } from './src/domain/distanceSource';

type Tab = 'setup' | 'alarm' | 'group';
const GREEN = '#00E676';
const pad = (value: number) => String(value).padStart(2, '0');

export default function App() {
  const [tab, setTab] = useState<Tab>('setup');
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [targetDistance, setTargetDistance] = useState(10);
  const [testMode, setTestMode] = useState(true);
  const [session, setSession] = useState<AlarmSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInAs, setSignedInAs] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [memberIdInput, setMemberIdInput] = useState('');
  const [group, setGroup] = useState<{ name: string; members: string[] } | null>(null);

  const mode: TrackingMode = testMode ? 'simulation' : 'sensor';
  const source: DistanceSource = useMemo(() => simulatedDistanceSource, []);
  const distance = session?.verifiedDistance ?? 0;
  const progress = Math.min(distance / targetDistance, 1);

  const startAlarm = () => {
    setSession(createAlarmSession(mode, targetDistance));
    setTab('alarm');
  };

  const addMovement = (estimated: number, verified: number, steps: number) => {
    if (!session || session.status !== 'ringing') return;
    let next = recordEstimatedWalkingDistance(session, estimated, steps);
    const result = source.verify({ mode: session.mode, meters: verified });
    if (result.available) next = recordVerifiedDistance(next, result.meters);
    next = finishAlarm(next);
    setSession(next);
  };

  const stepHour = (delta: number) => setHour((v) => (v + delta + 24) % 24);
  const stepMinute = (delta: number) => setMinute((v) => (v + delta + 60) % 60);
  const stepDistance = (delta: number) => setTargetDistance((v) => Math.max(7, Math.min(50, v + delta)));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.app}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>STEP ALARM</Text>
            <Text style={styles.brand}>MOVE TO WAKE<Text style={styles.green}>.</Text></Text>
          </View>
          <View style={styles.modePill}>
            <View style={[styles.modeDot, { backgroundColor: testMode ? GREEN : '#FFB547' }]} />
            <Text style={styles.modeText}>{testMode ? 'DEMO' : 'SENSOR OFF'}</Text>
          </View>
        </View>

        <View style={styles.modeBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeBarTitle}>가상 이동 테스트</Text>
            <Text style={styles.mutedSmall}>{testMode ? '버튼으로 시연 데이터를 입력해요' : '실제 센서 연결은 아직 준비 중이에요'}</Text>
          </View>
          <Switch value={testMode} onValueChange={setTestMode} disabled={session?.status === 'ringing'} trackColor={{ false: '#303438', true: '#176C48' }} thumbColor={testMode ? GREEN : '#BFC6C3'} />
        </View>

        <View style={styles.content}>
          {tab === 'setup' && (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <SectionHeading eyebrow="01 / ALARM" title="일어날 시간을 정해요" subtitle="시간과 목표 거리를 설정하세요." />
              <View style={styles.panel}>
                <View style={styles.panelHeading}>
                  <Text style={styles.label}>알람 시각</Text>
                  <Text style={styles.unitTag}>24시간</Text>
                </View>
                <View style={styles.wheelRow}>
                  <WheelPicker value={hour} values={Array.from({ length: 24 }, (_, i) => i)} onStep={stepHour} />
                  <Text style={styles.wheelColon}>:</Text>
                  <WheelPicker value={minute} values={Array.from({ length: 60 }, (_, i) => i)} onStep={stepMinute} />
                </View>
                <Text style={styles.wheelHint}>휠을 위아래로 밀어 시간을 조절하세요</Text>
              </View>

              <View style={[styles.panel, { marginTop: 14 }]}>
                <View style={styles.panelHeading}>
                  <View>
                    <Text style={styles.label}>목표 이동 거리</Text>
                    <Text style={[styles.mutedSmall, { marginTop: 5 }]}>최소 7m · 1m 단위</Text>
                  </View>
                  <Text style={styles.unitTag}>누적 거리</Text>
                </View>
                <View style={styles.distancePicker}>
                  <WheelPicker value={targetDistance} values={Array.from({ length: 44 }, (_, i) => i + 7)} onStep={stepDistance} suffix="m" />
                </View>
                <Text style={styles.wheelHint}>왕복 경로도 이동한 만큼 누적돼요</Text>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoMark}>i</Text>
                <Text style={styles.infoText}>걸음 수와 보행 추정만으로는 실제 이동을 확정하지 않아요. 위치 검증이 불가능하면 알람 해제 거리에 포함하지 않습니다.</Text>
              </View>
              <TouchableOpacity style={styles.cta} onPress={startAlarm} activeOpacity={0.8}>
                <Text style={styles.ctaText}>알람 화면 보기</Text><Text style={styles.ctaArrow}>→</Text>
              </TouchableOpacity>
              <Text style={styles.disclaimer}>미리보기는 알람을 예약하거나 실제로 울리지 않습니다</Text>
            </ScrollView>
          )}

          {tab === 'alarm' && (
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <SectionHeading eyebrow="02 / WAKE UP" title={session?.status === 'completed' ? '움직임 목표 달성' : '알람이 울리고 있어요'} subtitle="목표 거리에 도달하면 알람이 해제됩니다." />
              <View style={styles.ringPanel}>
                <View style={styles.alarmTimeRow}><Text style={styles.alarmTime}>{pad(hour)}:{pad(minute)}</Text><View style={styles.ringingPill}><View style={styles.ringPulse} /><Text style={styles.ringingLabel}>{session?.status === 'completed' ? '해제됨' : 'RINGING'}</Text></View></View>
                <Text style={styles.label}>검증된 이동 거리</Text>
                <Text style={styles.bigDistance}>{distance.toFixed(1)}<Text style={styles.bigUnit}> / {targetDistance} m</Text></Text>
                <View style={styles.track}>
                  <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
                  <View style={[styles.trackDot, { left: `${progress * 100}%` }]} />
                </View>
                <View style={styles.trackCaptions}><Text style={styles.trackCaptionText}>출발</Text><Text style={styles.trackCaptionText}>{Math.max(0, targetDistance - distance).toFixed(1)}m 남음</Text><Text style={styles.trackCaptionText}>목표</Text></View>
                <View style={styles.statGrid}>
                  <Metric label="보행 추정" value={`${(session?.estimatedWalkingDistance ?? 0).toFixed(1)} m`} />
                  <Metric label="걸음 수" value={`${session?.estimatedSteps ?? 0}`} />
                  <Metric label="누적 경로" value={`${distance.toFixed(1)} m`} accent />
                </View>
              </View>

              <View style={styles.statusPanel}>
                <View style={[styles.statusDot, { backgroundColor: session?.mode === 'simulation' ? GREEN : '#FFB547' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{session?.mode === 'simulation' ? '가상 이동 테스트 모드' : '위치 검증 불가'}</Text>
                  <Text style={[styles.mutedSmall, { marginTop: 4 }]}>{session?.mode === 'simulation' ? '아래 값은 시연용이며 실제 측정 데이터가 아닙니다.' : '센서 연결 전까지 검증 거리를 추가하지 않습니다.'}</Text>
                </View>
              </View>
              {session?.mode === 'simulation' && session.status !== 'completed' && (
                <View style={styles.simulator}>
                  <View style={styles.panelHeading}><Text style={styles.label}>가상 이동 데이터</Text><Text style={styles.unitTag}>DEMO ONLY</Text></View>
                  <Text style={[styles.mutedSmall, { marginBottom: 12 }]}>제자리걸음은 걸음 추정에만 추가돼요.</Text>
                  <View style={styles.demoButtons}>
                    <DemoButton title="제자리걸음" detail="+12걸음 · 거리 검증 없음" onPress={() => addMovement(0.8, 0, 12)} />
                    <DemoButton title="가상 3m 이동" detail="걸음 + 경로 거리 +3m" onPress={() => addMovement(3, 3, 40)} />
                    <DemoButton title="가상 5m 이동" detail="걸음 + 경로 거리 +5m" onPress={() => addMovement(5, 5, 68)} />
                  </View>
                </View>
              )}
              <TouchableOpacity style={styles.outlineButton} onPress={() => setTab('setup')}><Text style={styles.outlineText}>알람 설정으로</Text></TouchableOpacity>
              <Text style={styles.disclaimer}>실제 위치 검증은 아직 연결되지 않았으며 센서 부정 동작 감지는 완벽하지 않습니다</Text>
            </ScrollView>
          )}

          {tab === 'group' && (
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <SectionHeading eyebrow="03 / COMMUNITY" title="함께 일어나요" subtitle="로그인과 그룹 기능은 화면 시연용 로컬 상태입니다." />
              {!signedInAs ? (
                <View style={styles.panel}>
                  <Text style={styles.label}>로그인 또는 회원가입</Text>
                  <Text style={[styles.mutedSmall, { marginTop: 5, marginBottom: 15 }]}>Gmail 또는 아이디로 계속하기</Text>
                  <TextInput value={email} onChangeText={setEmail} placeholder="이메일 또는 사용자 아이디" placeholderTextColor="#747C79" autoCapitalize="none" style={styles.input} />
                  <TextInput value={password} onChangeText={setPassword} placeholder="비밀번호" placeholderTextColor="#747C79" secureTextEntry style={styles.input} />
                  <View style={styles.authActions}>
                    <TouchableOpacity style={[styles.authAction, styles.authActionPrimary]} onPress={() => email.trim() && password && setSignedInAs(email.trim())}><Text style={styles.authActionPrimaryText}>로그인</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.authAction} onPress={() => email.trim() && password && setSignedInAs(email.trim())}><Text style={styles.authActionText}>회원가입</Text></TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.googleButton} onPress={() => setSignedInAs('Google 데모 계정')}><Text style={styles.googleG}>G</Text><Text style={styles.googleText}>Google로 계속하기 · 데모</Text></TouchableOpacity>
                  <Text style={styles.disclaimer}>인증 정보는 저장하거나 전송하지 않으며, 실제 계정 생성은 지원하지 않습니다.</Text>
                </View>
              ) : (
                <View style={styles.panel}>
                  <View style={styles.profileRow}><View style={styles.avatar}><Text style={styles.avatarText}>{signedInAs[0]?.toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.label}>{signedInAs}</Text><Text style={[styles.mutedSmall, { marginTop: 4 }]}>로컬 데모 프로필</Text></View><TouchableOpacity onPress={() => setSignedInAs('')}><Text style={styles.linkText}>로그아웃</Text></TouchableOpacity></View>
                </View>
              )}

              <View style={[styles.panel, { marginTop: 14 }]}>
                <View style={styles.panelHeading}><Text style={styles.label}>그룹 만들기</Text><Text style={styles.unitTag}>WEEKLY</Text></View>
                <TextInput value={groupNameInput} onChangeText={setGroupNameInput} placeholder="그룹 이름" placeholderTextColor="#747C79" style={styles.input} />
                <TextInput value={memberIdInput} onChangeText={setMemberIdInput} placeholder="초대할 사용자 아이디" placeholderTextColor="#747C79" autoCapitalize="none" style={styles.input} />
                <TouchableOpacity style={styles.cta} onPress={() => {
                  const name = groupNameInput.trim();
                  if (!name) return;
                  setGroup({ name, members: [signedInAs || '나', ...(memberIdInput.trim() ? [memberIdInput.trim()] : [])] });
                  setGroupNameInput(''); setMemberIdInput('');
                }}><Text style={styles.ctaText}>{group ? '그룹 업데이트' : '그룹 생성'}</Text></TouchableOpacity>
              </View>

              {group && (
                <View style={[styles.panel, { marginTop: 14 }]}>
                  <View style={styles.panelHeading}><View><Text style={styles.label}>{group.name}</Text><Text style={[styles.mutedSmall, { marginTop: 4 }]}>{group.members.length}명 · 주간 알람 기록</Text></View><Text style={styles.unitTag}>이번 주</Text></View>
                  <View style={styles.weekRow}>{['월', '화', '수', '목', '금', '토', '일'].map((day, i) => <View key={day} style={styles.dayCell}><View style={[styles.dayBar, i < 3 ? styles.dayBarActive : null]} /><Text style={styles.dayLabel}>{day}</Text></View>)}</View>
                  <Text style={styles.historyTitle}>알람 시작부터 해제까지</Text>
                  {group.members.map((member, i) => <View key={`${member}-${i}`} style={styles.memberRow}><View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{member[0]?.toUpperCase()}</Text></View><Text style={styles.memberName}>{member}</Text><Text style={styles.memberTime}>{i === 0 && session?.status === 'completed' ? '04분 32초' : '기록 대기 중'}</Text></View>)}
                  <Text style={[styles.disclaimer, { textAlign: 'left' }]}>그룹 기록과 초대는 이 기기에만 표시되는 데모 데이터입니다. 다른 사용자와 공유되지 않습니다.</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        <View style={styles.tabBar}>
          <TabButton active={tab === 'setup'} icon="◷" label="알람 설정" onPress={() => setTab('setup')} />
          <TabButton active={tab === 'alarm'} icon="◉" label="알람 진행" onPress={() => setTab('alarm')} />
          <TabButton active={tab === 'group'} icon="◎" label="계정 · 그룹" onPress={() => setTab('group')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionEyebrow}>{eyebrow}</Text><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>;
}

function WheelPicker({ value, values, onStep, suffix = '' }: { value: number; values: number[]; onStep: (delta: number) => void; suffix?: string }) {
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
    onPanResponderRelease: (_, gesture) => {
      const steps = Math.round(gesture.dy / 36);
      if (steps !== 0) onStep(-steps);
    },
  }), [onStep]);
  const index = values.indexOf(value);
  const get = (delta: number) => values[(index + delta + values.length) % values.length];
  const format = (number: number) => suffix ? String(number) : pad(number);
  return <View style={styles.wheel} {...responder.panHandlers}>
    <TouchableOpacity onPress={() => onStep(1)} style={styles.wheelItem}><Text style={styles.wheelFaded}>{format(get(-2))}{suffix}</Text></TouchableOpacity>
    <TouchableOpacity onPress={() => onStep(1)} style={styles.wheelItem}><Text style={styles.wheelNear}>{format(get(-1))}{suffix}</Text></TouchableOpacity>
    <View style={styles.wheelSelected}><Text style={styles.wheelValue}>{format(value)}<Text style={styles.wheelSuffix}>{suffix}</Text></Text></View>
    <TouchableOpacity onPress={() => onStep(-1)} style={styles.wheelItem}><Text style={styles.wheelNear}>{format(get(1))}{suffix}</Text></TouchableOpacity>
    <TouchableOpacity onPress={() => onStep(-1)} style={styles.wheelItem}><Text style={styles.wheelFaded}>{format(get(2))}{suffix}</Text></TouchableOpacity>
  </View>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, accent && styles.green]}>{value}</Text></View>;
}

function DemoButton({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.demoButton} onPress={onPress}><View style={styles.demoPlay}><Text style={styles.demoPlayText}>+</Text></View><View style={{ flex: 1 }}><Text style={styles.demoTitle}>{title}</Text><Text style={styles.demoDetail}>{detail}</Text></View><Text style={styles.demoArrow}>→</Text></TouchableOpacity>;
}

function TabButton({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={styles.tabButton}><Text style={[styles.tabIcon, active && styles.green]}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text><View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} /></TouchableOpacity>;
}

const C = { bg: '#090B0A', panel: '#121614', panel2: '#171C19', border: '#252C28', text: '#F3F7F4', muted: '#8A9690' };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg }, app: { flex: 1, maxWidth: 560, width: '100%', alignSelf: 'center' },
  topBar: { paddingHorizontal: 22, paddingTop: 13, paddingBottom: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: GREEN, fontSize: 9, fontWeight: '900', letterSpacing: 2.3, marginBottom: 4 }, brand: { color: C.text, fontSize: 19, fontWeight: '900', letterSpacing: 0.3 }, green: { color: GREEN },
  modePill: { flexDirection: 'row', alignItems: 'center', borderRadius: 30, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border }, modeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 }, modeText: { color: C.text, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  modeBar: { marginHorizontal: 20, marginBottom: 6, borderRadius: 14, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }, modeBarTitle: { color: C.text, fontSize: 11, fontWeight: '700', marginBottom: 2 }, mutedSmall: { color: C.muted, fontSize: 10, lineHeight: 15 },
  content: { flex: 1 }, scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 }, sectionHeading: { marginBottom: 18 }, sectionEyebrow: { color: GREEN, fontSize: 9, fontWeight: '900', letterSpacing: 1.7, marginBottom: 7 }, sectionTitle: { color: C.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.5 }, sectionSubtitle: { color: C.muted, fontSize: 11, marginTop: 6 },
  panel: { backgroundColor: C.panel, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16 }, panelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, label: { color: C.text, fontSize: 12, fontWeight: '700' }, unitTag: { color: GREEN, fontSize: 8, fontWeight: '900', letterSpacing: 1, borderColor: '#1D5940', borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 5 },
  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, height: 185 }, wheelColon: { color: GREEN, fontSize: 36, fontWeight: '300', marginHorizontal: 5 }, wheel: { width: 112, alignItems: 'stretch', justifyContent: 'center', overflow: 'hidden' }, wheelItem: { height: 28, alignItems: 'center', justifyContent: 'center' }, wheelFaded: { color: '#38413C', fontSize: 14, fontWeight: '500' }, wheelNear: { color: '#6D7972', fontSize: 18, fontWeight: '600' }, wheelSelected: { height: 52, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#235E41', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1812' }, wheelValue: { color: C.text, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] }, wheelSuffix: { color: GREEN, fontSize: 15, fontWeight: '700' }, wheelHint: { color: '#647068', fontSize: 9, textAlign: 'center', marginTop: 7 }, distancePicker: { alignItems: 'center', marginTop: 5 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, backgroundColor: '#101B15', borderWidth: 1, borderColor: '#1D3829', padding: 12, marginTop: 14 }, infoMark: { color: GREEN, borderColor: '#1B7D4E', borderWidth: 1, borderRadius: 9, overflow: 'hidden', textAlign: 'center', width: 17, height: 17, fontSize: 11, fontWeight: '800', marginRight: 9 }, infoText: { flex: 1, color: '#9BA89F', fontSize: 10, lineHeight: 16 },
  cta: { height: 51, borderRadius: 12, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 16 }, ctaText: { color: '#06140C', fontSize: 12, fontWeight: '900' }, ctaArrow: { color: '#06140C', fontSize: 17, fontWeight: '700', marginLeft: 9 }, disclaimer: { color: '#647068', textAlign: 'center', fontSize: 9, lineHeight: 14, marginTop: 11 },
  ringPanel: { backgroundColor: C.panel, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18 }, alarmTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 19 }, alarmTime: { color: C.text, fontSize: 39, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 }, ringingPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, backgroundColor: '#211512', paddingHorizontal: 9, paddingVertical: 7 }, ringPulse: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF674D', marginRight: 6 }, ringingLabel: { color: '#FF8977', fontSize: 8, letterSpacing: 1, fontWeight: '900' }, bigDistance: { color: GREEN, fontSize: 31, fontWeight: '800', marginTop: 7, fontVariant: ['tabular-nums'] }, bigUnit: { color: '#758078', fontSize: 14, fontWeight: '600' },
  track: { height: 5, borderRadius: 4, backgroundColor: '#2A322D', marginTop: 20, position: 'relative', justifyContent: 'center' }, trackFill: { height: 5, borderRadius: 4, backgroundColor: GREEN }, trackDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: C.panel, backgroundColor: GREEN, position: 'absolute', marginLeft: -8, shadowColor: GREEN, shadowOpacity: 0.65, shadowRadius: 8, elevation: 4 }, trackCaptions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }, trackCaptionsText: { color: C.muted, fontSize: 9 },
  trackCaptionText: { color: C.muted, fontSize: 9 }, statGrid: { flexDirection: 'row', marginTop: 21, borderTopWidth: 1, borderColor: C.border, paddingTop: 15 }, metric: { flex: 1 }, metricLabel: { color: C.muted, fontSize: 9, marginBottom: 7 }, metricValue: { color: C.text, fontSize: 15, fontWeight: '700' }, statusPanel: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel, borderRadius: 13, borderWidth: 1, borderColor: C.border, padding: 13, marginTop: 12 }, statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 10 },
  simulator: { backgroundColor: C.panel, borderRadius: 17, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 12 }, demoButtons: { gap: 8 }, demoButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 10 }, demoPlay: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#123B27', marginRight: 10 }, demoPlayText: { color: GREEN, fontSize: 18, fontWeight: '600' }, demoTitle: { color: C.text, fontSize: 10, fontWeight: '700' }, demoDetail: { color: C.muted, fontSize: 8, marginTop: 3 }, demoArrow: { color: GREEN, fontSize: 15, paddingHorizontal: 6 }, outlineButton: { alignItems: 'center', justifyContent: 'center', height: 43, borderRadius: 11, borderWidth: 1, borderColor: C.border, marginTop: 12 }, outlineText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  input: { height: 45, borderRadius: 10, backgroundColor: '#0B0E0C', borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, color: C.text, fontSize: 11, marginTop: 10 }, authActions: { flexDirection: 'row', gap: 9, marginTop: 12 }, authAction: { flex: 1, height: 43, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }, authActionPrimary: { backgroundColor: GREEN, borderColor: GREEN }, authActionText: { color: C.text, fontSize: 10, fontWeight: '700' }, authActionPrimaryText: { color: '#06140C', fontSize: 10, fontWeight: '900' }, googleButton: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 9 }, googleG: { color: '#79A7FF', fontSize: 15, fontWeight: '900', marginRight: 8 }, googleText: { color: C.text, fontSize: 10, fontWeight: '700' }, profileRow: { flexDirection: 'row', alignItems: 'center' }, avatar: { width: 39, height: 39, borderRadius: 14, backgroundColor: '#123B27', alignItems: 'center', justifyContent: 'center', marginRight: 11 }, avatarText: { color: GREEN, fontSize: 16, fontWeight: '900' }, linkText: { color: GREEN, fontSize: 10, fontWeight: '700' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, marginBottom: 20 }, dayCell: { alignItems: 'center', gap: 7 }, dayBar: { height: 34, width: 17, borderRadius: 5, backgroundColor: '#272F2A' }, dayBarActive: { backgroundColor: '#00A956' }, dayLabel: { color: C.muted, fontSize: 9 }, historyTitle: { color: C.text, fontSize: 10, fontWeight: '700', borderTopWidth: 1, borderColor: C.border, paddingTop: 14, marginBottom: 8 }, memberRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#202622', paddingVertical: 9 }, memberAvatar: { width: 25, height: 25, borderRadius: 9, backgroundColor: '#252D28', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, memberAvatarText: { color: '#B8C4BC', fontSize: 10, fontWeight: '800' }, memberName: { color: C.text, fontSize: 10, flex: 1 }, memberTime: { color: GREEN, fontSize: 9, fontWeight: '700' },
  tabBar: { height: 66, flexDirection: 'row', backgroundColor: '#0D100E', borderTopWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingBottom: 4 }, tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, tabIcon: { color: '#657168', fontSize: 19, marginBottom: 3 }, tabLabel: { color: '#78837B', fontSize: 8, fontWeight: '600' }, tabLabelActive: { color: C.text }, tabIndicator: { position: 'absolute', height: 2, width: 22, borderRadius: 2, backgroundColor: 'transparent', top: 0 }, tabIndicatorActive: { backgroundColor: GREEN },
});
