(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const state = {
    tab: 'setup',
    testMode: true,
    target: 10,
    session: null,
    scheduled: null,
    scheduleTimer: null,
    signedInAs: '',
    group: null,
  };

  const timeInput = $('#alarm-time');
  const timeControl = $('#time-control');
  const targetInput = $('#target-distance');
  const soundInput = $('#alarm-sound');
  const testToggle = $('#test-mode');
  const scheduleButton = $('#schedule-alarm');
  const timeLabel = () => timeInput.value || '07:00';
  const formatDistance = (number) => Number(number).toFixed(1);
  const audioContextType = window.AudioContext || window.webkitAudioContext;
  let audioContext = null;
  let alarmBufferPromise = null;
  let alarmSource = null;
  let synthTimer = null;
  let activeNotification = null;

  function selectTab(name) {
    state.tab = name;
    $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    $$('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`));
    history.replaceState(null, '', `#${name}`);
  }

  function updateMode() {
    state.testMode = testToggle.checked;
    const available = state.session?.status === 'ringing';
    testToggle.disabled = available;
    $('#mode-label').textContent = state.testMode ? '가상 테스트 모드' : '실제 센서 미연결';
    $('.connection').classList.toggle('sensor', !state.testMode);
    $('#mode-dot').style.background = state.testMode ? 'var(--green)' : '#ffb547';
    if (state.session) renderAlarm();
  }

  function updateTarget() {
    state.target = Number(targetInput.value);
    $('#target-value').textContent = state.target;
    const percent = ((state.target - 7) / (50 - 7)) * 100;
    targetInput.style.setProperty('--range-progress', `${percent}%`);
    if (!state.session || state.session.status === 'completed') renderAlarm();
  }

  function prepareAlarmAudio() {
    if (!audioContextType) return Promise.reject(new Error('Web Audio is unavailable'));
    if (!audioContext) audioContext = new audioContextType();
    const resumed = audioContext.resume();
    if (!alarmBufferPromise) {
      alarmBufferPromise = fetch('/assets/alarm_cc0.wav')
        .then((response) => {
          if (!response.ok) throw new Error('Alarm sound could not be loaded');
          return response.arrayBuffer();
        })
        .then((buffer) => audioContext.decodeAudioData(buffer));
    }
    return Promise.all([resumed, alarmBufferPromise]).then(([, buffer]) => buffer);
  }

  function playTone(frequency, duration, waveform = 'sine') {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playSynthPattern(sound) {
    if (sound === 'bell') {
      playTone(784, 0.45, 'sine');
      window.setTimeout(() => playTone(988, 0.48, 'sine'), 230);
    } else {
      playTone(880, 0.22, 'square');
      window.setTimeout(() => playTone(660, 0.22, 'square'), 270);
    }
  }

  function stopAlarmSound() {
    if (synthTimer) window.clearInterval(synthTimer);
    synthTimer = null;
    if (alarmSource) {
      try { alarmSource.stop(); } catch { /* already stopped */ }
      alarmSource.disconnect();
      alarmSource = null;
    }
    if (activeNotification) activeNotification.close();
    activeNotification = null;
  }

  async function startAlarmSound(sound, preview = false) {
    stopAlarmSound();
    if (sound === 'silent') return;
    if (!audioContext && audioContextType) audioContext = new audioContextType();
    if (!audioContext) throw new Error('Web Audio is unavailable');
    await audioContext.resume();

    if (sound === 'cc0') {
      const buffer = await prepareAlarmAudio();
      alarmSource = audioContext.createBufferSource();
      alarmSource.buffer = buffer;
      alarmSource.loop = !preview;
      alarmSource.connect(audioContext.destination);
      alarmSource.onended = () => { if (preview) alarmSource = null; };
      alarmSource.start();
      return;
    }

    playSynthPattern(sound);
    if (!preview) synthTimer = window.setInterval(() => playSynthPattern(sound), sound === 'bell' ? 1800 : 1100);
  }

  function renderSchedule() {
    const scheduled = state.scheduled;
    if (!scheduled) {
      $('#schedule-status').textContent = '예약된 알람이 없습니다.';
      $('#schedule-status').classList.remove('schedule-armed');
      scheduleButton.innerHTML = '알람 예약하기 <span>→</span>';
      return;
    }
    const dateLabel = new Date(scheduled.scheduledAt).toLocaleString('ko-KR', {
      month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    $('#schedule-status').textContent = `${dateLabel} · 목표 ${scheduled.targetDistance}m · 1회 예약됨`;
    $('#schedule-status').classList.add('schedule-armed');
    scheduleButton.textContent = '예약 취소';
  }

  function armScheduledAlarm() {
    if (state.scheduleTimer) window.clearTimeout(state.scheduleTimer);
    state.scheduleTimer = null;
    if (!state.scheduled) return;
    const delay = state.scheduled.scheduledAt - Date.now();
    if (delay <= 0) return fireScheduledAlarm();
    state.scheduleTimer = window.setTimeout(armScheduledAlarm, Math.min(delay, 2147480000));
  }

  function fireScheduledAlarm() {
    const scheduled = state.scheduled;
    if (!scheduled) return;
    state.scheduled = null;
    window.localStorage.removeItem('move-to-wake-schedule');
    renderSchedule();
    state.target = scheduled.targetDistance;
    targetInput.value = String(state.target);
    testToggle.checked = scheduled.mode === 'simulation';
    state.testMode = testToggle.checked;
    state.session = {
      mode: scheduled.mode,
      status: 'ringing',
      targetDistance: scheduled.targetDistance,
      estimatedWalkingDistance: 0,
      verifiedDistance: 0,
      estimatedSteps: 0,
      startedAt: Date.now(),
    };
    renderAlarm();
    selectTab('alarm');
    startAlarmSound(scheduled.sound).catch(() => {
      $('#verification-note').querySelector('small').textContent = '브라우저가 소리 재생을 차단했어요. 화면을 눌러 다시 확인해 주세요.';
    });
    if ('Notification' in window && Notification.permission === 'granted') {
      activeNotification = new Notification('알람이 울리고 있어요', {
        body: `${scheduled.targetDistance}m를 이동하면 알람이 해제됩니다.`,
      });
      activeNotification.onclick = () => window.focus();
    }
  }

  async function scheduleAlarm() {
    if (state.scheduled) {
      window.clearTimeout(state.scheduleTimer);
      state.scheduleTimer = null;
      state.scheduled = null;
      window.localStorage.removeItem('move-to-wake-schedule');
      renderSchedule();
      return;
    }

    const [hours, minutes] = timeLabel().split(':').map(Number);
    const scheduledAt = new Date();
    scheduledAt.setHours(hours, minutes, 0, 0);
    if (scheduledAt.getTime() <= Date.now()) scheduledAt.setDate(scheduledAt.getDate() + 1);
    state.scheduled = {
      scheduledAt: scheduledAt.getTime(),
      targetDistance: Number(targetInput.value),
      time: timeLabel(),
      sound: soundInput.value,
      mode: testToggle.checked ? 'simulation' : 'sensor',
    };
    window.localStorage.setItem('move-to-wake-schedule', JSON.stringify(state.scheduled));
    renderSchedule();
    armScheduledAlarm();
    if (state.scheduled.sound !== 'silent') prepareAlarmAudio().catch(() => {});
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
    $('#simulator').classList.toggle('hidden', session?.mode !== 'simulation' || done);

    const note = $('#verification-note');
    if (!session) {
      note.innerHTML = '<i></i><span><b>알람 대기</b><small>설정한 시각에 예약된 알람이 시작되면 진행 상태를 보여줍니다.</small></span>';
      note.classList.remove('sensor-note');
    } else if (session.mode === 'sensor') {
      note.innerHTML = '<i></i><span><b>위치 검증 불가</b><small>센서가 연결되지 않아 이동을 검증 거리로 추가하지 않습니다.</small></span>';
      note.classList.add('sensor-note');
    } else {
      note.innerHTML = '<i></i><span><b>가상 테스트 데이터</b><small>아래 입력값은 시연용이며 실제 이동 측정값이 아닙니다.</small></span>';
      note.classList.remove('sensor-note');
    }
    testToggle.disabled = session?.status === 'ringing';
  }

  function addMovement(estimated, verified, steps) {
    const session = state.session;
    if (!session || session.status !== 'ringing') return;
    session.estimatedWalkingDistance += estimated;
    session.estimatedSteps += steps;
    if (session.mode === 'simulation' && Number.isFinite(verified) && verified > 0) {
      session.verifiedDistance += verified;
    }
    if (session.verifiedDistance >= session.targetDistance) session.status = 'completed';
    renderAlarm();
    if (session.status === 'completed') {
      stopAlarmSound();
      testToggle.disabled = false;
      renderSchedule();
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
    $('#sound-feedback').textContent = '';
    startAlarmSound(soundInput.value, true).catch(() => {
      $('#sound-feedback').textContent = '소리를 재생할 수 없습니다. 다시 눌러 시도해 주세요.';
    });
  });
  scheduleButton.addEventListener('click', scheduleAlarm);
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
  testToggle.addEventListener('change', updateMode);
  $$('.demo-button').forEach((button) => button.addEventListener('click', () => {
    addMovement(Number(button.dataset.estimated), Number(button.dataset.distance), Number(button.dataset.steps));
  }));
  $('#login').addEventListener('click', () => signIn('password'));
  $('#signup').addEventListener('click', () => signIn('password'));
  $('#google-login').addEventListener('click', () => signIn('google'));
  $('#create-group').addEventListener('click', createGroup);
  $('#group-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') createGroup(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.scheduled && Date.now() >= state.scheduled.scheduledAt) {
      fireScheduledAlarm();
    }
  });

  const initialTab = location.hash.slice(1);
  selectTab(['setup', 'alarm', 'community'].includes(initialTab) ? initialTab : 'setup');
  const savedSound = window.localStorage.getItem('move-to-wake-sound');
  if (savedSound && [...soundInput.options].some((option) => option.value === savedSound)) soundInput.value = savedSound;
  updateTarget();
  updateMode();
  renderSchedule();
  try {
    const saved = JSON.parse(window.localStorage.getItem('move-to-wake-schedule') || 'null');
    if (saved && saved.scheduledAt > Date.now()) {
      state.scheduled = saved;
      timeInput.value = saved.time;
      targetInput.value = String(saved.targetDistance);
      state.target = saved.targetDistance;
      soundInput.value = saved.sound;
      testToggle.checked = saved.mode === 'simulation';
      updateMode();
      updateTarget();
      renderSchedule();
      armScheduledAlarm();
    } else if (saved) {
      window.localStorage.removeItem('move-to-wake-schedule');
      $('#schedule-status').textContent = '지난 예약이 만료됐습니다. 다시 예약해 주세요.';
    }
  } catch {
    window.localStorage.removeItem('move-to-wake-schedule');
  }
})();
