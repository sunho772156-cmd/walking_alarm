# 걸어서 끄는 알람

React Native + TypeScript + Expo를 사용하는 Android/iOS 앱 시작 구조입니다. 현재는 실제 센서나 운영체제 알람 예약을 연결하지 않았습니다.

## 개발 환경

- Windows 10/11
- Node.js LTS 및 npm
- Android Studio와 Android Emulator 또는 Android 실기기
- Cursor에서 이 폴더 열기
- iOS 빌드/시뮬레이터에는 macOS 및 Xcode가 필요합니다. Windows에서는 Expo Go로 iOS 기기에서 미리 볼 수 있지만 네이티브 iOS 빌드는 할 수 없습니다.

## 설치 및 실행 (아직 실행하지 않음)

```powershell
npm install
npm start
```

개발 서버가 뜨면 Expo Go에서 QR 코드를 스캔하거나 Android 에뮬레이터에서 `a`를 누릅니다. 추가 확인:

```powershell
npm test
npm run typecheck
```

## 모드와 한계

- **가상 이동 테스트**: 화면의 버튼으로 걸음 추정치와 가상 검증 거리를 입력합니다. 이 숫자는 시연 전용이며 실제 위치 측정값이 아닙니다.
- **실제 센서 모드 (미구현)**: Android/iOS 센서 연결 및 알람 스케줄링이 없습니다. 앱은 추적 불가 상태로 표시하고 이 모드의 이동을 검증 거리로 인정하지 않습니다.
- `estimatedWalkingDistance`는 보행 추정 누적치이고 `verifiedDistance`는 검증 인터페이스가 제공한 값만 보관합니다. 실제 실내에서 위치를 검증할 수 있는 센서·인프라가 없는 상황에서 가속도 데이터만으로 10m 이동을 확정하지 않습니다. 센서 기반 부정 동작 감지는 완벽하지 않습니다.
