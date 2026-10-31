(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const appBaseUrl = new URL('.', document.currentScript.src);
  const assetUrl = (path) => new URL(path.replace(/^\/+/, ''), appBaseUrl).href;
  const state = {
    tab: 'setup',
    target: 10,
    session: null,
    scheduled: [],
    scheduleTimers: new Map(),
    editingAlarmId: null,
    sensorActive: false,
    sensorStats: { steps: 0, estimatedDistance: 0, acceleration: '—', rotation: '—', orientation: '—', accelerationReceived: false, rotationReceived: false, orientationReceived: false },
    signedInAs: '',
    group: null,
  };

  const timeInput = $('#alarm-time');
  const timeControl = $('#time-control');
  const targetInput = $('#target-distance');
  const soundInput = $('#alarm-sound');
  const scheduleButton = $('#schedule-alarm');
  const setupForm = $('#setup-form');
  const alarmList = $('#alarm-list');
  const addAlarmButton = $('#add-alarm');
  const timeLabel = () => timeInput.value || '07:00';
  const formatDistance = (number) => Number(number).toFixed(1);
  let activeNotification = null;
  let alarmAudio = null;
  let availableSounds = [];
  let distanceVerifier = null;
  let sensorWatchdog = null;
  const motionEstimator = {
    baselineMagnitude: null,
    previousHighPass: 0,
    highPass: 0,
    noiseFloor: 0,
    lastSampleAt: 0,
    lastStepAt: 0,
    candidateStartedAt: 0,
    candidatePeak: 0,
    candidateSamples: 0,
    candidateDuration: 0,
    lastCandidateAt: 0,
    lastCandidatePeak: 0,
    lastUiAt: 0,
  };

  function selectTab(name) {
    state.tab = name;
    $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`));
    history.replaceState(null, '', `#${name}`);
  }

  function updateSensorPanel() {
    $('#sensor-acceleration').textContent = state.sensorStats.acceleration;
    $('#sensor-rotation').textContent = state.sensorStats.rotation;
    $('#sensor-orientation').textContent = state.sensorStats.orientation;
    $('#sensor-steps').textContent = String(state.sensorStats.steps);
    $('#sensor-distance').textContent = `${formatDistance(state.sensorStats.estimatedDistance)} m`;
    $('#sensor-verified').textContent = `${formatDistance(state.session?.verifiedDistance ?? 0)} m`;
  }

  function detectSensorSupport() {
    const motionSupported = typeof window.DeviceMotionEvent !== 'undefined';
    const orientationSupported = typeof window.DeviceOrientationEvent !== 'undefined';
    $('#motion-support').textContent = `가속도: ${motionSupported ? '브라우저 지원' : '미지원'}`;
    $('#gyro-support').textContent = `자이로 회전: ${motionSupported ? '이벤트 확인 필요' : '미지원'}`;
    $('#orientation-support').textContent = `방향: ${orientationSupported ? '브라우저 지원' : '미지원'}`;
    if (!motionSupported && !orientationSupported) {
      $('#sensor-state-chip').textContent = '센서 미지원';
      $('#sensor-status').textContent = '이 브라우저는 모션 및 방향 센서 API를 제공하지 않습니다.';
      $('#sensor-help').classList.remove('hidden');
      $('#sensor-retry').classList.remove('hidden');
    } else {
      $('#sensor-status').textContent = window.isSecureContext
        ? '지원 여부 확인됨 · 센서 권한 요청과 데이터 수집은 버튼을 눌렀을 때 시작됩니다.'
        : '센서 API가 감지됐습니다. 실제 데이터 수집에는 HTTPS 연결이 필요합니다.';
    }
  }

  function requestSensorPermissionsFromGesture() {
    const motionSupported = typeof window.DeviceMotionEvent !== 'undefined';
    const orientationSupported = typeof window.DeviceOrientationEvent !== 'undefined';
    $('#motion-support').textContent = `가속도: ${motionSupported ? '지원' : '미지원'}`;
    $('#gyro-support').textContent = `자이로 회전: ${motionSupported ? '권한 확인 중' : '미지원'}`;
    $('#orientation-support').textContent = `방향: ${orientationSupported ? '지원' : '미지원'}`;

    let motionPermission;
    let orientationPermission;
    try {
      motionPermission = motionSupported && typeof window.DeviceMotionEvent.requestPermission === 'function'
        ? window.DeviceMotionEvent.requestPermission()
        : Promise.resolve(motionSupported ? 'granted' : 'unsupported');
    } catch (error) { motionPermission = Promise.reject(error); }
    try {
      orientationPermission = orientationSupported && typeof window.DeviceOrientationEvent.requestPermission === 'function'
        ? window.DeviceOrientationEvent.requestPermission()
        : Promise.resolve(orientationSupported ? 'granted' : 'unsupported');
    } catch (error) { orientationPermission = Promise.reject(error); }
    return Promise.allSettled([motionPermission, orientationPermission]).then(([motion, orientation]) => ({
      motion: motion.status === 'fulfilled' ? motion.value === 'granted' : false,
      orientation: orientation.status === 'fulfilled' ? orientation.value === 'granted' : false,
      motionSupported,
      orientationSupported,
    }));
  }

  function handleMotion(event) {
    const isVector = (value) => value && value.x != null && value.y != null && value.z != null;
    const acceleration = isVector(event.acceleration)
      ? event.acceleration
      : event.accelerationIncludingGravity;
    const rotation = event.rotationRate;
    if (isVector(acceleration)) {
      const magnitude = Math.hypot(acceleration.x, acceleration.y, acceleration.z);
      state.sensorStats.acceleration = `${acceleration.x.toFixed(2)}, ${acceleration.y.toFixed(2)}, ${acceleration.z.toFixed(2)}`;
      state.sensorStats.accelerationReceived = true;
      $('#motion-support').textContent = '가속도: 데이터 수신';
      const now = Date.now();
      const elapsed = motionEstimator.lastSampleAt
        ? Math.min(0.25, Math.max(0.01, (now - motionEstimator.lastSampleAt) / 1000))
        : 0.05;
      if (motionEstimator.baselineMagnitude === null) motionEstimator.baselineMagnitude = magnitude;
      const filterTimeConstant = event.acceleration ? 0.55 : 1.2;
      const alpha = 1 - Math.exp(-elapsed / filterTimeConstant);
      motionEstimator.baselineMagnitude += (magnitude - motionEstimator.baselineMagnitude) * alpha;
      const highPass = magnitude - motionEstimator.baselineMagnitude;
      motionEstimator.noiseFloor = motionEstimator.noiseFloor * 0.99 + Math.abs(highPass) * 0.01;
      const peakThreshold = Math.max(1.15, motionEstimator.noiseFloor * 2.5);
      const isPeak = motionEstimator.highPass > motionEstimator.previousHighPass
        && motionEstimator.highPass >= highPass;

      if (motionEstimator.highPass > peakThreshold) {
        if (!motionEstimator.candidateStartedAt) motionEstimator.candidateStartedAt = now;
        motionEstimator.candidatePeak = Math.max(motionEstimator.candidatePeak, motionEstimator.highPass);
        motionEstimator.candidateSamples += 1;
        motionEstimator.candidateDuration = now - motionEstimator.candidateStartedAt;
      }

      if (isPeak) {
        const candidatePeak = motionEstimator.candidatePeak;
        const candidateDuration = motionEstimator.candidateDuration;
        const candidateSamples = motionEstimator.candidateSamples;
        const interval = motionEstimator.lastCandidateAt ? now - motionEstimator.lastCandidateAt : 0;
        const amplitudeRatio = motionEstimator.lastCandidatePeak
          ? Math.min(candidatePeak, motionEstimator.lastCandidatePeak) / Math.max(candidatePeak, motionEstimator.lastCandidatePeak)
          : 0;
        const plausibleWalkingCycle = interval >= 450 && interval <= 1100
          && amplitudeRatio >= 0.45 && amplitudeRatio <= 1;
        const plausiblePulse = candidatePeak >= peakThreshold && candidateDuration >= 35
          && candidateDuration <= 450 && candidateSamples >= 2;

        if (plausiblePulse && plausibleWalkingCycle && now - motionEstimator.lastStepAt >= 450) {
          motionEstimator.lastStepAt = now;
          state.sensorStats.steps += 1;
          state.sensorStats.estimatedDistance += 0.7;
          if (state.session?.status === 'ringing') {
            state.session.estimatedSteps += 1;
            state.session.estimatedWalkingDistance += 0.7;
            distanceVerifier?.addWalkingStep();
          }
        }

        motionEstimator.lastCandidateAt = now;
        motionEstimator.lastCandidatePeak = candidatePeak;
        motionEstimator.candidateStartedAt = 0;
        motionEstimator.candidatePeak = 0;
        motionEstimator.candidateSamples = 0;
        motionEstimator.candidateDuration = 0;
      }

      motionEstimator.previousHighPass = motionEstimator.highPass;
      motionEstimator.highPass = highPass;
      motionEstimator.lastSampleAt = now;
    }
    if (rotation && rotation.alpha != null && rotation.beta != null && rotation.gamma != null) {
      state.sensorStats.rotation = `${rotation.alpha.toFixed(1)}, ${rotation.beta.toFixed(1)}, ${rotation.gamma.toFixed(1)}`;
      state.sensorStats.rotationReceived = true;
      $('#gyro-support').textContent = '자이로 회전: 데이터 수신';
    }
    $('#acceleration-readout').textContent = state.sensorStats.acceleration;
    updateSensorPanel();
    renderAlarm();
    $('#sensor-status').textContent = '센서 데이터 수신 중 · 걸음 수와 거리는 추정값입니다.';
  }

  function handleOrientation(event) {
    const values = [event.alpha, event.beta, event.gamma];
    if (values.some((value) => value == null)) return;
    state.sensorStats.orientation = values.map((value) => value.toFixed(1)).join(', ');
    state.sensorStats.orientationReceived = true;
    $('#orientation-support').textContent = '방향: 데이터 수신';
    updateSensorPanel();
    $('#sensor-status').textContent = '방향 데이터 수신 중 · 각도만으로 이동을 판단하지 않습니다.';
  }

  function startDistanceVerification() {
    distanceVerifier?.stop();
    if (!state.sensorActive || !state.session || state.session.status !== 'ringing') return;
    distanceVerifier = window.DistanceVerifier.create(({ verifiedDistance, status }) => {
      if (!state.session || state.session.status !== 'ringing') return;
      state.session.verifiedDistance = verifiedDistance;
      $('#tracking-status').textContent = status;
      updateSensorPanel();
      renderAlarm();
      if (verifiedDistance >= state.session.targetDistance) {
        state.session.status = 'completed';
        stopAlarmSound();
        stopSensors();
        renderAlarm();
      }
    }, state.session.verifiedDistance);
    distanceVerifier.start();
  }

  function startSensors() {
    const startButton = $('#sensor-start');
    if (!window.isSecureContext) {
      $('#sensor-state-chip').textContent = 'HTTPS 필요';
      $('#sensor-status').textContent = '이 주소는 HTTP입니다. 센서 권한을 요청하지 않았습니다. HTTPS 주소에서 다시 시도하세요.';
      $('#sensor-help').classList.remove('hidden');
      $('#sensor-retry').classList.remove('hidden');
      return;
    }
    startButton.disabled = true;
    $('#sensor-status').textContent = '기기의 센서 지원과 권한을 확인하는 중…';
    requestSensorPermissionsFromGesture().then((permission) => {
      const motionOkay = permission.motionSupported && permission.motion;
      const orientationOkay = permission.orientationSupported && permission.orientation;
      $('#motion-support').textContent = `가속도: ${!permission.motionSupported ? '미지원' : motionOkay ? '허용됨' : '권한 거부'}`;
      $('#gyro-support').textContent = `자이로 회전: ${!permission.motionSupported ? '미지원' : motionOkay ? '데이터 확인 중' : '권한 거부'}`;
      $('#orientation-support').textContent = `방향: ${!permission.orientationSupported ? '미지원' : orientationOkay ? '허용됨' : '권한 거부'}`;
      if (!motionOkay && !orientationOkay) {
        state.sensorActive = false;
        $('#sensor-state-chip').textContent = '사용 불가';
        $('#sensor-status').textContent = '센서가 지원되지 않거나 권한이 거부되었습니다.';
        $('#sensor-help').classList.remove('hidden');
        $('#sensor-retry').classList.remove('hidden');
        startButton.disabled = false;
        return;
      }

      state.sensorActive = true;
      motionEstimator.baselineMagnitude = null;
      motionEstimator.previousHighPass = 0;
      motionEstimator.highPass = 0;
      motionEstimator.noiseFloor = 0;
      motionEstimator.lastSampleAt = 0;
      motionEstimator.lastStepAt = 0;
      motionEstimator.candidateStartedAt = 0;
      motionEstimator.candidatePeak = 0;
      motionEstimator.candidateSamples = 0;
      motionEstimator.candidateDuration = 0;
      motionEstimator.lastCandidateAt = 0;
      motionEstimator.lastCandidatePeak = 0;
      state.sensorStats.accelerationReceived = false;
      state.sensorStats.rotationReceived = false;
      state.sensorStats.orientationReceived = false;
      state.sensorStats.acceleration = '—';
      state.sensorStats.rotation = '—';
      state.sensorStats.orientation = '—';
      updateSensorPanel();
      if (motionOkay) window.addEventListener('devicemotion', handleMotion, { passive: true });
      if (orientationOkay) window.addEventListener('deviceorientation', handleOrientation, { passive: true });
      if (window.isSecureContext && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true, timeout: 10000 });
      }
      if (state.session?.status === 'ringing') startDistanceVerification();
      $('#sensor-state-chip').textContent = '센서 사용 중';
      $('#sensor-status').textContent = '센서 이벤트를 기다리는 중…';
      $('#sensor-help').classList.toggle('hidden', motionOkay && orientationOkay);
      $('#sensor-retry').classList.toggle('hidden', motionOkay && orientationOkay);
      startButton.textContent = '센서 사용 중지';
      startButton.disabled = false;
      if (motionOkay || orientationOkay) {
        sensorWatchdog = window.setTimeout(() => {
          if (state.sensorActive && !state.sensorStats.accelerationReceived && !state.sensorStats.orientationReceived) {
            $('#sensor-status').textContent = '권한은 허용됐지만 센서 데이터가 오지 않습니다. 브라우저 설정과 기기 지원을 확인하세요.';
            $('#sensor-help').classList.remove('hidden');
            $('#sensor-retry').classList.remove('hidden');
          } else if (state.sensorActive) {
            if (!state.sensorStats.rotationReceived) $('#gyro-support').textContent = '자이로 회전: 데이터 미제공';
            if (!state.sensorStats.orientationReceived) $('#orientation-support').textContent = '방향: 데이터 미제공';
          }
        }, 5000);
      }
    }).catch(() => {
      $('#sensor-state-chip').textContent = '사용 불가';
      $('#sensor-status').textContent = '센서 권한 요청에 실패했습니다. 설정을 확인하고 다시 시도해 주세요.';
      $('#sensor-help').classList.remove('hidden');
      $('#sensor-retry').classList.remove('hidden');
      startButton.disabled = false;
    });
  }

  function stopSensors(updateUi = true) {
    window.removeEventListener('devicemotion', handleMotion);
    window.removeEventListener('deviceorientation', handleOrientation);
    window.clearTimeout(sensorWatchdog);
    distanceVerifier?.stop();
    distanceVerifier = null;
    state.sensorActive = false;
    $('#sensor-start').textContent = '센서 사용 시작';
    if (updateUi) {
      $('#sensor-state-chip').textContent = '사용 중지';
      $('#sensor-status').textContent = '센서 데이터 수집을 중지했습니다.';
      $('#sensor-retry').classList.add('hidden');
    }
  }

  function updateTarget() {
    state.target = Number(targetInput.value);
    $('#target-value').textContent = state.target;
    const percent = ((state.target - 7) / (50 - 7)) * 100;
    targetInput.style.setProperty('--range-progress', `${percent}%`);
    if (!state.session || state.session.status === 'completed') renderAlarm();
  }

  function renderAlarmList() {
    const alarms = JSON.parse(window.localStorage.getItem('move-to-wake-alarms') || '[]');
    alarms.sort((a, b) => a.time.localeCompare(b.time));
    window.localStorage.setItem('move-to-wake-alarms', JSON.stringify(alarms));
    alarmList.replaceChildren();
    for (const alarm of alarms) {
      const card = document.createElement('article');
      card.className = 'card saved-alarm-card';
      const time = document.createElement('strong');
      time.textContent = alarm.time;
      const distance = document.createElement('span');
      distance.textContent = `목표 이동 거리 ${alarm.targetDistance}m`;
      card.dataset.alarmId = alarm.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'group');
      card.setAttribute('aria-label', `${alarm.time}, 목표 이동 거리 ${alarm.targetDistance}m 알람`);
      card.addEventListener('click', () => editAlarm(alarm.id));
      card.addEventListener('keydown', (event) => {
        if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          editAlarm(alarm.id);
        }
      });
      const removeButton = document.createElement('button');
      removeButton.className = 'delete-alarm';
      removeButton.type = 'button';
      removeButton.textContent = '×';
      removeButton.setAttribute('aria-label', `${alarm.time} 알람 삭제`);
      removeButton.title = '알람 삭제';
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteAlarm(alarm.id);
      });
      card.append(time, distance, removeButton);
      alarmList.append(card);
    }
    const hasAlarms = alarms.length > 0;
    setupForm.classList.toggle('hidden', hasAlarms);
    alarmList.classList.toggle('hidden', !hasAlarms);
    addAlarmButton.classList.toggle('hidden', !hasAlarms);
    $('#schedule-status').classList.toggle('hidden', hasAlarms);
  }

  function deleteAlarm(alarmId) {
    const timer = state.scheduleTimers.get(alarmId);
    if (timer) window.clearTimeout(timer);
    state.scheduleTimers.delete(alarmId);
    state.scheduled = state.scheduled.filter((alarm) => alarm.id !== alarmId);
    persistScheduledAlarms();
    const alarms = JSON.parse(window.localStorage.getItem('move-to-wake-alarms') || '[]');
    window.localStorage.setItem('move-to-wake-alarms', JSON.stringify(alarms.filter((alarm) => alarm.id !== alarmId)));
    if (state.editingAlarmId === alarmId) {
      state.editingAlarmId = null;
      scheduleButton.textContent = '완료';
    }
    renderAlarmList();
    renderSchedule();
  }

  function editAlarm(alarmId) {
    const alarms = JSON.parse(window.localStorage.getItem('move-to-wake-alarms') || '[]');
    const alarm = alarms.find((entry) => entry.id === alarmId);
    if (!alarm) return;
    state.editingAlarmId = alarmId;
    timeInput.value = alarm.time;
    targetInput.value = String(alarm.targetDistance);
    if ([...soundInput.options].some((option) => option.value === alarm.sound)) soundInput.value = alarm.sound;
    updateTarget();
    setupForm.classList.remove('hidden');
    addAlarmButton.classList.add('hidden');
    scheduleButton.textContent = '수정';
    timeInput.focus();
  }

  async function loadAlarmSounds() {
    try {
      const response = await fetch(assetUrl('assets/alarm_sounds/manifest.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error('No extracted sounds');
      const manifest = await response.json();
      availableSounds = Array.isArray(manifest.sounds)
        ? manifest.sounds.map((sound) => ({ ...sound, src: assetUrl(sound.src) }))
        : [];
    } catch {
      availableSounds = [];
    }

    soundInput.replaceChildren();
    if (availableSounds.length === 0) {
      soundInput.add(new Option('MP4에서 음원 추출 전', 'silent'));
      soundInput.disabled = true;
      $('#preview-sound').disabled = true;
      $('#sound-feedback').textContent = '폴더의 MP4 파일에서 음원을 추출하면 이 목록이 채워집니다.';
      window.localStorage.removeItem('move-to-wake-sound');
    } else {
      for (const sound of availableSounds) soundInput.add(new Option(sound.name, sound.src));
      soundInput.disabled = false;
      $('#preview-sound').disabled = false;
      $('#sound-feedback').textContent = `${availableSounds.length}개 음원을 불러왔습니다.`;
      const savedSound = window.localStorage.getItem('move-to-wake-sound');
      if (savedSound && availableSounds.some((sound) => sound.src === savedSound)) soundInput.value = savedSound;
      else window.localStorage.removeItem('move-to-wake-sound');
    }
  }

  function getAlarmAudio(source) {
    if (!source || source === 'silent') return Promise.reject(new Error('No alarm sound selected'));
    if (!alarmAudio || alarmAudio.src !== new URL(source, window.location.href).href) {
      alarmAudio?.pause();
      alarmAudio = new Audio(source);
    }
    return alarmAudio;
  }

  function startAlarmSound(source) {
    const audio = getAlarmAudio(source);
    if (audio instanceof Promise) return audio;
    audio.loop = true;
    audio.currentTime = 0;
    return audio.play();
  }

  function previewAlarmSound(source) {
    const audio = getAlarmAudio(source);
    if (audio instanceof Promise) return audio;
    audio.loop = false;
    alarmAudio.currentTime = 0;
    return audio.play();
  }

  function primeAlarmSound(source) {
    if (!source || source === 'silent') return;
    if (!alarmAudio || alarmAudio.src !== new URL(source, window.location.href).href) {
      alarmAudio?.pause();
      alarmAudio = new Audio(source);
    }
    alarmAudio.muted = true;
    alarmAudio.play().then(() => {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio.muted = false;
    }).catch(() => { alarmAudio.muted = false; });
  }

  function stopAlarmSound() {
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
    }
    if (activeNotification) activeNotification.close();
    activeNotification = null;
  }

  function renderSchedule() {
    $('#schedule-status').textContent = state.scheduled.length
      ? `${state.scheduled.length}개 알람이 예약되어 있습니다.`
      : '예약된 알람이 없습니다.';
    $('#schedule-status').classList.toggle('schedule-armed', state.scheduled.length > 0);
    scheduleButton.textContent = '완료';
    scheduleButton.disabled = false;
  }

  function persistScheduledAlarms() {
    window.localStorage.setItem('move-to-wake-schedule-list', JSON.stringify(state.scheduled));
  }

  function armScheduledAlarm(alarm) {
    const existingTimer = state.scheduleTimers.get(alarm.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    const delay = alarm.scheduledAt - Date.now();
    if (delay <= 0) return fireScheduledAlarm(alarm.id);
    const timer = window.setTimeout(() => fireScheduledAlarm(alarm.id), Math.min(delay, 2147480000));
    state.scheduleTimers.set(alarm.id, timer);
  }

  function fireScheduledAlarm(alarmId) {
    const index = state.scheduled.findIndex((alarm) => alarm.id === alarmId);
    if (index < 0) return;
    const [scheduled] = state.scheduled.splice(index, 1);
    state.scheduleTimers.delete(alarmId);
    persistScheduledAlarms();
    renderSchedule();
    renderAlarmList();
    state.target = scheduled.targetDistance;
    targetInput.value = String(state.target);
    state.session = {
      mode: 'sensor',
      status: 'ringing',
      targetDistance: scheduled.targetDistance,
      estimatedWalkingDistance: 0,
      verifiedDistance: 0,
      estimatedSteps: 0,
      startedAt: Date.now(),
    };
    renderAlarm();
    selectTab('alarm');
    if (state.sensorActive) startDistanceVerification();
    else $('#tracking-status').textContent = '알람이 시작됐습니다. 설정 탭에서 센서 사용 시작을 눌러 추적을 켜세요.';
    if (scheduled.sound && scheduled.sound !== 'silent') {
      startAlarmSound(scheduled.sound).catch(() => {
        $('#verification-note').querySelector('small').textContent = '브라우저가 알람음 재생을 차단했습니다. 화면을 한 번 누른 뒤 다시 시도해 주세요.';
      });
    } else {
      $('#verification-note').querySelector('small').textContent = '선택된 알람음이 없어 브라우저 알림만 표시됩니다.';
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      activeNotification = new Notification('알람이 울리고 있어요', {
        body: `${scheduled.targetDistance}m를 이동하면 알람이 해제됩니다.`,
        silent: true,
      });
      activeNotification.onclick = () => {
        window.focus();
        selectTab('alarm');
      };
    }
  }

  async function scheduleAlarm() {
    const [hours, minutes] = timeLabel().split(':').map(Number);
    const scheduledAt = new Date();
    scheduledAt.setHours(hours, minutes, 0, 0);
    if (scheduledAt.getTime() <= Date.now()) scheduledAt.setDate(scheduledAt.getDate() + 1);
    const alarms = JSON.parse(window.localStorage.getItem('move-to-wake-alarms') || '[]');
    const scheduled = {
      id: state.editingAlarmId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      scheduledAt: scheduledAt.getTime(),
      targetDistance: Number(targetInput.value),
      time: timeLabel(),
      sound: soundInput.value,
      mode: 'sensor',
    };
    const existingTimer = state.scheduleTimers.get(scheduled.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    state.scheduleTimers.delete(scheduled.id);
    state.scheduled = state.scheduled.filter((alarm) => alarm.id !== scheduled.id);
    state.scheduled.push(scheduled);
    state.scheduled.sort((a, b) => a.time.localeCompare(b.time));
    persistScheduledAlarms();
    window.localStorage.setItem('move-to-wake-sound', soundInput.value);
    const previousIndex = alarms.findIndex((alarm) => alarm.id === scheduled.id);
    if (previousIndex >= 0) alarms[previousIndex] = scheduled;
    else alarms.push(scheduled);
    window.localStorage.setItem('move-to-wake-alarms', JSON.stringify(alarms));
    state.editingAlarmId = null;
    renderAlarmList();
    primeAlarmSound(soundInput.value);
    renderSchedule();
    armScheduledAlarm(scheduled);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function renderAlarm() {
    const session = state.session;
    const verified = session?.verifiedDistance ?? 0;
    const estimated = session?.estimatedWalkingDistance ?? 0;
    const steps = session?.estimatedSteps ?? 0;
    const goal = session?.targetDistance ?? Number(targetInput.value);
    const progress = Math.min(verified / goal, 1);
    const remaining = Math.max(0, goal - verified);

    $('#ring-time').textContent = timeLabel();
    $('#verified-value').textContent = formatDistance(verified);
    $('#goal-value').textContent = goal;
    $('#remaining-value').textContent = `${formatDistance(remaining)}m 남음`;
    $('#estimated-value').textContent = `${formatDistance(estimated)} m`;
    $('#steps-value').textContent = String(steps);
    $('#route-value').textContent = `${formatDistance(verified)} m`;
    $('#progress-fill').style.width = `${progress * 100}%`;
    $('#progress-dot').style.left = `${progress * 100}%`;

    const done = session?.status === 'completed';
    const status = $('#ring-status');
    status.classList.toggle('done', done);
    status.innerHTML = `<i></i> ${done ? '목표 달성' : session ? '알람 진행 중' : '알람 대기'}`;
    $('#alarm-heading').innerHTML = done ? '목표를 달성했어요<span class="green">.</span>' : session ? '걸어서 하루를 시작해요<span class="green">.</span>' : '설정한 알람이 여기에 표시돼요<span class="green">.</span>';
    const note = $('#verification-note');
    if (!session) {
      note.innerHTML = '<i></i><span><b>걸음 신호와 위치를 함께 확인합니다</b><small>가속도 기반 걸음 추정과 정확한 위치 이동이 함께 확인될 때만 보수적으로 계산한 거리를 인정합니다. 실내에서 위치 정확도가 낮으면 거리가 늘지 않을 수 있습니다.</small></span>';
      $('#tracking-status').textContent = '알람이 울리면 센서 상태를 확인합니다.';
    }
  }

  function signIn(provider) {
    const id = $('#account-id').value.trim();
    const password = $('#account-password').value;
    if (provider === 'google') {
      state.signedInAs = 'Google 데모 계정';
    } else {
      if (!id || !password) {
        $('#auth-feedback').textContent = '아이디와 비밀번호를 입력해 주세요. 이 화면은 로컬 데모입니다.';
        return;
      }
      state.signedInAs = id;
    }
    $('#auth-feedback').textContent = `${state.signedInAs} · 로컬 데모로 로그인되었습니다.`;
    $('#auth-feedback').classList.add('feedback-success');
  }

  function createGroup() {
    const name = $('#group-name').value.trim();
    const member = $('#member-id').value.trim();
    if (!name) {
      $('#group-name').focus();
      $('#group-feedback').textContent = '그룹 이름을 입력해 주세요.';
      return;
    }
    state.group = { name, members: [state.signedInAs || '나', ...(member ? [member] : [])] };
    $('#group-title').textContent = name;
    $('#group-members').textContent = `${state.group.members.length}명 · 주간 알람 기록`;
    $('#group-result').classList.remove('empty-group');
    $('#group-result').classList.add('created');
    $('#group-result').innerHTML = `<span>◎</span><b>${escapeHtml(name)}</b><small>${state.group.members.length}명이 있는 그룹 · 이 브라우저에서만 보이는 데모</small>`;
    $('#group-feedback').textContent = '';
    $('#member-list').innerHTML = state.group.members.map((person, index) => {
      const display = escapeHtml(person);
      const duration = index === 0 && state.session?.status === 'completed' ? '00:04:32' : '기록 대기 중';
      return `<div class="member-row"><span class="member-avatar">${display.slice(0, 1).toUpperCase()}</span><span class="member-name">${display}</span><span class="member-time">${duration}</span></div>`;
    }).join('');
    $('#weekly-card').classList.remove('hidden');
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  $$('.tab').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  targetInput.addEventListener('input', updateTarget);
  timeInput.addEventListener('input', renderAlarm);
  soundInput.addEventListener('change', () => window.localStorage.setItem('move-to-wake-sound', soundInput.value));
  $('#preview-sound').addEventListener('click', () => {
    previewAlarmSound(soundInput.value).catch(() => {
      $('#sound-feedback').textContent = '음원을 재생할 수 없습니다. 파일을 확인하고 다시 시도해 주세요.';
    });
  });
  scheduleButton.addEventListener('click', scheduleAlarm);
  $('#sensor-start').addEventListener('click', () => {
    if (state.sensorActive) stopSensors();
    else startSensors();
  });
  $('#sensor-retry').addEventListener('click', () => {
    if (state.sensorActive) stopSensors(false);
    startSensors();
  });
  addAlarmButton.addEventListener('click', () => {
    state.editingAlarmId = null;
    setupForm.classList.remove('hidden');
    addAlarmButton.classList.add('hidden');
    scheduleButton.textContent = '완료';
  });
  timeControl.addEventListener('wheel', (event) => {
    event.preventDefault();
    const [hours, minutes] = timeInput.value.split(':').map(Number);
    const minuteOfDay = hours * 60 + minutes;
    const direction = event.deltaY < 0 ? 1 : -1;
    const increment = event.ctrlKey || event.metaKey ? 720 : event.shiftKey ? 60 : 1;
    const next = (minuteOfDay + direction * increment + 1440) % 1440;
    timeInput.value = `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
    timeInput.dispatchEvent(new Event('input', { bubbles: true }));
  }, { passive: false });
  $('#login').addEventListener('click', () => signIn('password'));
  $('#signup').addEventListener('click', () => signIn('password'));
  $('#google-login').addEventListener('click', () => signIn('google'));
  $('#create-group').addEventListener('click', createGroup);
  $('#group-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') createGroup(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      state.scheduled.filter((alarm) => Date.now() >= alarm.scheduledAt).forEach((alarm) => fireScheduledAlarm(alarm.id));
      if (state.session?.status === 'ringing') selectTab('alarm');
    }
  });

  async function initializeApp() {
    const initialTab = location.hash.slice(1);
    selectTab(['setup', 'alarm', 'community'].includes(initialTab) ? initialTab : 'setup');
    await loadAlarmSounds();
    detectSensorSupport();
    updateSensorPanel();
    updateTarget();
    renderAlarmList();
    renderSchedule();
    try {
      const saved = JSON.parse(window.localStorage.getItem('move-to-wake-schedule-list') || 'null');
      if (Array.isArray(saved)) state.scheduled = saved.filter((alarm) => alarm.scheduledAt > Date.now());
      else {
        const legacy = JSON.parse(window.localStorage.getItem('move-to-wake-schedule') || 'null');
        if (legacy && legacy.scheduledAt > Date.now()) {
          legacy.id ||= `legacy-${legacy.scheduledAt}`;
          state.scheduled = [legacy];
          persistScheduledAlarms();
          window.localStorage.removeItem('move-to-wake-schedule');
        }
      }
      const alarms = JSON.parse(window.localStorage.getItem('move-to-wake-alarms') || '[]');
      for (const alarm of state.scheduled) {
        if (!availableSounds.some((sound) => sound.src === alarm.sound)) alarm.sound = 'silent';
        if (!alarms.some((item) => item.id === alarm.id)) alarms.push(alarm);
        armScheduledAlarm(alarm);
      }
      window.localStorage.setItem('move-to-wake-alarms', JSON.stringify(alarms));
      persistScheduledAlarms();
      renderAlarmList();
      renderSchedule();
    } catch {
      window.localStorage.removeItem('move-to-wake-schedule');
    }
  }

  initializeApp();
})();
