# 걸어서 깨우는 알람

React Native + TypeScript + Expo 기반 Android/iOS 화면 프로토타입입니다. 현재 실제 센서, 운영체제 알람 예약, 서버 기능은 연결하지 않았습니다.

## 개발 환경

- Windows 10/11, Node.js LTS, npm
- Android Studio와 Android Emulator 또는 Android 실기기
- Cursor에서 이 폴더 열기
- iOS 네이티브 빌드와 시뮬레이터에는 macOS 및 Xcode가 필요합니다. Windows에서는 Expo Go로 iOS 기기에서 미리 볼 수 있지만 네이티브 iOS 빌드는 할 수 없습니다.

## 설치 및 실행

아래 명령은 사용자가 직접 실행해야 하며, Codex는 패키지를 설치하지 않았습니다.

```powershell
npm install
npm start
```

Expo 개발 서버가 시작되면 Expo Go에서 QR 코드를 스캔하거나 Android 에뮬레이터를 실행해 확인할 수 있습니다.

```powershell
npm test
npm run typecheck
```

## 화면 프로토타입

- 하단 탭에서 알람 설정, 알람 진행, 계정·그룹 화면을 이동합니다.
- 알람 시각과 목표 거리는 드래그 휠이나 인접 값 탭으로 조절합니다. 목표 거리는 7m부터 50m까지 1m 단위입니다.
- 알람 진행 화면은 보행 추정 거리, 걸음 수, 검증된 누적 경로 거리를 따로 표시합니다.
- 가상 테스트 버튼은 시연 데이터만 입력합니다. 제자리걸음은 추정 걸음과 추정 거리에만 반영되며, 검증 거리에는 포함되지 않습니다.
- 로그인/회원가입, Google 로그인, 그룹 생성, 사용자 아이디 초대 및 주간 기록은 로컬 화면 데모입니다. 실제 인증, 계정 생성, 서버 저장, 다른 사용자와의 동기화는 구현되지 않았습니다.

## 거리 검증 한계

- 보행 추정치(`estimatedWalkingDistance`)와 검증 거리(`verifiedDistance`)를 분리합니다.
- 실제 위치를 검증할 수 없으면 이동을 검증 거리로 인정하지 않습니다. 가속도 센서만으로 실제 이동 거리를 확정하지 않습니다.
- Android/iOS 실제 센서 연결 및 알람 스케줄링은 아직 구현되지 않았습니다. 센서 기반 부정 동작 감지도 완벽할 수 없습니다.
