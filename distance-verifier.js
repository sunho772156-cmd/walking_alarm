(() => {
  const MAX_ACCURACY_METERS = 6;
  const MAX_WALKING_SPEED_MPS = 2.2;

  function distanceBetween(a, b) {
    const radians = Math.PI / 180;
    const latitudeDelta = (b.latitude - a.latitude) * radians;
    const longitudeDelta = (b.longitude - a.longitude) * radians;
    const meanLatitude = (a.latitude + b.latitude) * radians / 2;
    return Math.hypot(latitudeDelta, longitudeDelta * Math.cos(meanLatitude)) * 6371000;
  }

  function createDistanceVerifier(onUpdate, initialDistance = 0) {
    let watchId = null;
    let previous = null;
    let stepsSincePreviousFix = 0;
    let verifiedDistance = initialDistance;

    const publish = (status, accuracy = null) => onUpdate({ verifiedDistance, status, accuracy });

    function onPosition(position) {
      const current = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp || Date.now(),
      };

      if (!Number.isFinite(current.accuracy) || current.accuracy > MAX_ACCURACY_METERS) {
        publish(`위치 정확도 부족 · 현재 ±${Math.round(current.accuracy || 0)}m`, current.accuracy);
        return;
      }

      if (!previous) {
        previous = current;
        stepsSincePreviousFix = 0;
        publish('위치 기준점 확보 · 걸음 신호와 이동 경로를 확인합니다.', current.accuracy);
        return;
      }

      const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;
      const rawDistance = distanceBetween(previous, current);
      const stepSupport = stepsSincePreviousFix;

      if (elapsedSeconds <= 0 || elapsedSeconds > 30 || rawDistance / elapsedSeconds > MAX_WALKING_SPEED_MPS) {
        previous = current;
        stepsSincePreviousFix = 0;
        publish('위치 변화가 보행 속도 범위를 벗어나 제외했습니다.', current.accuracy);
        return;
      }

      // Keep the anchor and walking evidence until short indoor GPS segments add up.
      const uncertainty = Math.min(2, (current.accuracy + previous.accuracy) * 0.25);
      const conservativeDistance = Math.max(0, rawDistance - uncertainty);
      const requiredSteps = Math.max(1, Math.ceil(conservativeDistance / 1.5));
      if (conservativeDistance < 0.5 || stepSupport < requiredSteps) {
        publish('걸음 신호와 위치 이동을 더 확인하고 있습니다. 아직 검증 거리에 포함하지 않았습니다.', current.accuracy);
        return;
      }

      verifiedDistance += conservativeDistance;
      previous = current;
      stepsSincePreviousFix = 0;
      publish(`걸음 신호와 정확한 위치 이동 확인 · ±${Math.round(current.accuracy)}m`, current.accuracy);
    }

    return {
      start() {
        if (!window.isSecureContext) {
          publish('위치 검증에는 HTTPS 연결이 필요합니다.');
          return false;
        }
        if (!navigator.geolocation) {
          publish('이 브라우저에서 위치 정보를 지원하지 않습니다.');
          return false;
        }
        publish('위치 권한을 기다리는 중…');
        watchId = navigator.geolocation.watchPosition(onPosition, (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? '위치 권한이 거부되어 검증 거리를 측정할 수 없습니다.'
            : error.code === error.TIMEOUT
              ? '위치 확인 시간이 초과되었습니다. 실내 위치 신호를 확인해 주세요.'
              : '위치 정보를 가져올 수 없습니다. 검증 거리는 유지됩니다.';
          publish(message);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        return true;
      },
      addWalkingStep() { stepsSincePreviousFix += 1; },
      stop() {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
      },
    };
  }

  window.DistanceVerifier = { create: createDistanceVerifier };
})();
