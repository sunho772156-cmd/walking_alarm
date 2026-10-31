(() => {
  const MIN_WALKING_SPEED_MPS = 0.45;
  const MAX_WALKING_SPEED_MPS = 2.2;
  const MAX_SAMPLE_GAP_SECONDS = 5;

  function createSpeedDistanceTracker(onUpdate, initialDistance = 0) {
    let watchId = null;
    let previous = null;
    let distance = initialDistance;

    const publish = (status) => onUpdate({ distance, status });

    function onPosition(position) {
      // Deliberately read only speed and timestamp. Coordinates and accuracy are
      // not accessed, retained, transmitted, or included in distance calculations.
      const speed = position.coords.speed;
      const timestamp = position.timestamp || Date.now();

      if (!Number.isFinite(speed) || speed < 0 || speed > MAX_WALKING_SPEED_MPS) {
        previous = null;
        publish('속도 정보를 사용할 수 없습니다. 위치 권한과 실내 GPS 수신 상태를 확인해 주세요.');
        return;
      }

      const current = { speed, timestamp };
      if (!previous) {
        previous = current;
        publish('속도 측정 시작 · 보행 속도 샘플을 기다리는 중입니다.');
        return;
      }

      const elapsedSeconds = (timestamp - previous.timestamp) / 1000;
      if (elapsedSeconds <= 0 || elapsedSeconds > MAX_SAMPLE_GAP_SECONDS) {
        previous = current;
        publish('속도 측정이 잠시 끊겨 새 기준을 잡았습니다.');
        return;
      }

      if (previous.speed >= MIN_WALKING_SPEED_MPS && speed >= MIN_WALKING_SPEED_MPS) {
        distance += ((previous.speed + speed) / 2) * elapsedSeconds;
      }

      previous = current;
      publish(speed >= MIN_WALKING_SPEED_MPS
        ? `실시간 속도 ${speed.toFixed(1)}m/s · 좌표는 사용하지 않습니다.`
        : '정지 또는 낮은 속도 · 이동 거리에 더하지 않습니다.');
    }

    return {
      start() {
        if (!window.isSecureContext) {
          publish('속도 측정에는 HTTPS 연결이 필요합니다.');
          return false;
        }
        if (!navigator.geolocation) {
          publish('이 브라우저에서 실시간 속도 측정을 지원하지 않습니다.');
          return false;
        }

        publish('속도 권한을 기다리는 중입니다. 위치 좌표는 사용하지 않습니다.');
        watchId = navigator.geolocation.watchPosition(onPosition, (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? '속도 측정 권한이 거부되었습니다. 브라우저에서 위치 권한을 허용해 주세요.'
            : error.code === error.TIMEOUT
              ? '속도 샘플 대기 시간이 초과되었습니다. 위치 권한과 실내 GPS 수신 상태를 확인해 주세요.'
              : '실시간 속도 샘플을 가져오지 못했습니다. 거리 누적을 보류합니다.';
          publish(message);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        return true;
      },
      stop() {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        previous = null;
      },
    };
  }

  window.SpeedDistanceTracker = { create: createSpeedDistanceTracker };
})();
