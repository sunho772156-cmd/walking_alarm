# Move to Wake 웹 미리보기

React Native/Expo 미리보기 대신 Node.js 기본 모듈로 실행하는 반응형 웹 UI입니다. 별도 웹 프레임워크나 패키지 설치 없이 실행할 수 있습니다.

## 실행

1. Cursor에서 이 폴더를 열고 **Terminal → New Terminal**을 선택합니다.
2. 터미널에서 다음 명령을 실행합니다.

```powershell
npm run dev
```

3. 브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.
4. 서버를 종료할 때는 터미널에서 `Ctrl+C`를 누릅니다.

`npm start`와 `npm run web`도 같은 웹 미리보기 서버를 실행합니다. 포트를 바꾸려면 PowerShell에서 `$env:PORT=4000; npm run dev`를 실행하고 `http://localhost:4000`을 여세요.

## 화면

- **알람 설정:** 시간 선택, 7m~50m 목표 거리 슬라이더
- **알람 진행:** 거리 진행 표시, 보행 추정 및 걸음 수, 데모 이동 입력
- **계정·그룹:** 로그인/회원가입 폼, 그룹 생성, 주간 기록 미리보기
- 작은 화면에서는 레이아웃이 모바일 너비에 맞춰 바뀝니다.

인증, 그룹 공유, 실제 센서 측정, 운영체제 알람은 연결하지 않았습니다. 로그인·그룹·이동 값은 화면 데모용이며 브라우저에 저장되거나 다른 사용자에게 전송되지 않습니다.

## 파일

- `index.html`: 웹 화면 구조
- `style.css`: 반응형 디자인
- `app.js`: 화면 이동과 데모 인터랙션
- `server.js`: Node.js 내장 HTTP 서버
