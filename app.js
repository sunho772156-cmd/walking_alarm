(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const state = {
    tab: 'setup',
    testMode: true,
    target: 10,
    session: null,
    signedInAs: '',
    group: null,
  };

  const timeInput = $('#alarm-time');
  const targetInput = $('#target-distance');
  const testToggle = $('#test-mode');
  const timeLabel = () => timeInput.value || '07:00';
  const formatDistance = (number) => Number(number).toFixed(1);

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

  function startPreview() {
    state.session = {
      mode: state.testMode ? 'simulation' : 'sensor',
      status: 'ringing',
      targetDistance: Number(targetInput.value),
      estimatedWalkingDistance: 0,
      verifiedDistance: 0,
      estimatedSteps: 0,
      startedAt: Date.now(),
    };
    testToggle.disabled = true;
    renderAlarm();
    selectTab('alarm');
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
    status.innerHTML = `<i></i> ${done ? '목표 달성' : '미리보기'}`;
    $('#alarm-heading').innerHTML = done ? '목표를 달성했어요<span class="green">.</span>' : '걸어서 하루를 시작해요<span class="green">.</span>';
    $('#simulator').classList.toggle('hidden', session?.mode !== 'simulation' || done);

    const note = $('#verification-note');
    if (session?.mode === 'sensor') {
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
    if (session.status === 'completed') testToggle.disabled = false;
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
  $('#preview-alarm').addEventListener('click', startPreview);
  targetInput.addEventListener('input', updateTarget);
  timeInput.addEventListener('input', renderAlarm);
  testToggle.addEventListener('change', updateMode);
  $$('.demo-button').forEach((button) => button.addEventListener('click', () => {
    addMovement(Number(button.dataset.estimated), Number(button.dataset.distance), Number(button.dataset.steps));
  }));
  $('#login').addEventListener('click', () => signIn('password'));
  $('#signup').addEventListener('click', () => signIn('password'));
  $('#google-login').addEventListener('click', () => signIn('google'));
  $('#create-group').addEventListener('click', createGroup);
  $('#group-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') createGroup(); });

  const initialTab = location.hash.slice(1);
  selectTab(['setup', 'alarm', 'community'].includes(initialTab) ? initialTab : 'setup');
  updateTarget();
  updateMode();
})();
