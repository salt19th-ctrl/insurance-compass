# 보험 나침반 (My Insurance Compass)

대학원 「생성형 AI와 바이브 코딩」 과제 2. 가상의 보험 가입정보를 누구나 이해하기 쉬운 한국어로 보여주는 체험용 웹앱입니다.

**체험용 가상 데이터이며 실제 보험조회가 아닙니다.** 모든 보험사·상품·계약은 가상입니다. 실제 개인정보, 주민등록번호, 증권, 고객·환자정보를 입력받지 않습니다.

## 구현 기능

- 가상 보험계약 4건, 보장 항목 10개 조회
- ‘내 보장 한눈에’ 대시보드: 조회 데이터에서 유형별 건수·주요 특약명을 계산하고, 카드 선택 시 해당 필터와 결과로 이동
- 보험별 보기 / 보장별 보기, 암·뇌질환·심장질환·수술·입원·상해 필터
- 보험사, 상품명, 계약상태, 보험기간, 특약명, 가입금액, 만기, 지급 조건 표시
- 기본 쉬운 설명, 주의사항, 약관 확인 목록과 요약표
- 글씨 크기 4단계(16/18/20/22px 기준), 큰 버튼, 모바일 대응, 키보드 접근
- 빈 데이터·조회 실패·중복 클릭·요청 시간 초과 처리
- 선택한 보장 ID만 서버에 보내는 AI 설명. 기본 설명은 AI 없이도 이용 가능

누락된 금액·만기는 **확인 필요**로 표시합니다. 뇌출혈/뇌졸중/뇌혈관질환, 급성심근경색/허혈성심장질환, 일반암/유사암은 서로 다른 보장입니다. 가입금액은 지급 확정액이 아니며, 금액을 합산해 수령액·적정성을 판단하지 않습니다. 가입 권유·의료 진단·지급 확정 판단 기능은 없습니다.

기본 설명은 이번 구현에서 작성하고 위 원칙에 맞게 문구를 검토한 학습 자료입니다. 보험 전문가의 감수나 실제 상품 약관 검증을 받은 자료는 아닙니다.

## 기술과 파일 구조

HTML, CSS, Vanilla JavaScript와 Vercel Node.js Function을 사용합니다. React, Next.js, Express, DB, 상시 운영 백엔드 서버는 사용하지 않습니다.

```text
index.html                         화면 구조
style.css                          반응형·접근성 스타일
app.js                             조회·필터·글씨 크기·AI 요청
assets/compass.svg                 로컬 아이콘
data/sample-insurance.json         가상 계약 및 기본 설명
services/insurance-service.js      조회 어댑터·스키마 검사·표시 형식
api/explain.js                     /api/explain 진입점, 공식 OpenAI SDK
server/explanation-service.js      허용 ID 검사·호출 제한·Responses 요청
scripts/build.mjs                 공개 파일을 dist/로 복사
scripts/preview.mjs               로컬 화면 미리보기 전용 정적 서버
scripts/check.mjs                 문법·데이터·공개 코드 키 참조 검사
scripts/check-live-api.mjs        배포 후 API 1회 확인 명령
tests/*.test.js                    데이터·서버·배포 구조 테스트
tests/browser/app.spec.js          Playwright 브라우저 테스트
playwright.config.js              Chrome 테스트 설정
vercel.json                       빌드·Function·보안 헤더 설정
package.json / package-lock.json   의존성과 실행 명령
.env.example / .gitignore         환경변수 예시·비공개 파일 제외
docs/development-log.md            실제 구현·검증 기록
```

`fetchInsuranceContracts()`를 나중에 정식 보험정보 연동 어댑터로 교체할 수 있습니다. 현재 검증기는 가상 데이터만 허용하므로 실제 연동 때는 사용자 동의·인증·접근통제·데이터 스키마도 별도로 설계해야 합니다.

## 로컬에서 기본 화면 확인

Node.js 24.x와 npm을 준비하고 프로젝트 최상위에서 실행합니다.

```sh
npm ci
npm run dev
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 종료는 `Ctrl+C`입니다. 파일을 직접 더블클릭하는 `file://` 실행은 ES module과 JSON 조회 때문에 지원하지 않습니다.

**`npm run dev`는 정적 화면만 제공합니다.** `/api/explain`은 의도적으로 503을 반환하며 AI 연결 오류 안내를 확인할 수 있습니다. 여기에 API 키를 넣어도 OpenAI를 호출하지 않습니다. 로컬 프리뷰 서버를 Vercel 운영 서버로 사용하지 않습니다.

## 검사 명령

```sh
npm run check
npm test
npm run test:browser
npm run build
```

브라우저 테스트는 설치된 Google Chrome을 사용합니다. Chrome이 없다면 Playwright의 Chromium을 설치한 뒤 다음과 같이 실행할 수 있습니다.

```sh
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:browser
```

Windows PowerShell에서는 `$env:PLAYWRIGHT_CHANNEL="chromium"` 설정 후 실행합니다. CI에서는 필요한 브라우저와 시스템 의존성도 설치해야 합니다.

단위 테스트와 Playwright의 AI 성공 테스트는 **모의 응답**을 사용하며 유료 OpenAI API를 호출하지 않습니다. `test:api`는 별도의 실제 호출 명령입니다. 테스트 결과와 확인하지 못한 범위는 [개발 기록](docs/development-log.md)에 구분했습니다.

## Vercel 배포 설정 — 사용자가 직접 수행

이 작업에서는 GitHub push, Vercel 프로젝트 연결, 배포를 수행하지 않았습니다.

| 설정 | 값 |
| --- | --- |
| Framework Preset | Other |
| Root Directory | 이 프로젝트의 `package.json`, `api/`가 있는 폴더 |
| Node.js | 24.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Function | 최상위 `api/explain.js` → `/api/explain` |

**Root Directory를 `dist`로 지정하거나 `dist`만 업로드하면 안 됩니다.** `dist`에는 공개 파일만 들어 있고, Vercel은 프로젝트 최상위 `api/`에서 Function을 별도로 빌드합니다. `/api/*`를 `index.html`로 보내는 rewrite를 추가하지 마세요. 현재 경로 충돌을 일으키는 rewrite/redirect는 없습니다.

`vercel.json`의 `includeFiles`는 서버가 읽는 `data/sample-insurance.json`을 Function에 포함합니다. `package.json`의 `"type": "module"`은 ESM import와 일치하며, 공식 OpenAI SDK는 운영 의존성입니다. Node.js 24.x는 [Vercel 지원 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)에 포함됩니다.

Vercel 프로젝트 환경변수에서 다음을 설정합니다. 실제 키를 파일·브라우저·Git·채팅에 붙여 넣지 마세요.

| 환경변수 | 설명 |
| --- | --- |
| `OPENAI_API_KEY` | 서버 전용 키. 미설정이면 AI만 503으로 비활성화 |
| `OPENAI_MODEL` | 선택. 기본 `gpt-5-mini` |
| `AI_DISABLED` | 선택. `true`이면 AI 호출 중단 |

사용할 Preview/Production 환경을 선택하고, 변경한 환경변수는 새 배포에 반영합니다. 모델 접근 권한과 결제·한도는 사용하는 OpenAI 프로젝트에 따라 확인해야 합니다. 다른 모델을 지정하면 Structured Outputs 및 `reasoning.effort: low` 지원 여부도 확인해야 합니다.

## 배포된 API 확인

배포 후 브라우저에서 보험을 조회하고 카드의 ‘AI로 쉽게 설명하기’를 누릅니다. 개발자 도구 Network에서 **POST `/api/explain`**이 JSON을 반환하는지 확인합니다.

또는 아래 명령으로 시연 보장 1건을 요청합니다. 실제 API 호출 비용이 발생할 수 있습니다.

```sh
npm run test:api -- https://본인-배포주소.vercel.app
```

성공 시 HTTP 200, 실제 사용 모델과 `simple`/`caution`/`check` 세 항목을 확인합니다. 이 명령에는 API 키를 전달하지 않습니다. 키는 Vercel에만 둡니다.

| 증상 | 확인할 내용 |
| --- | --- |
| `/api/explain` 404 | Root Directory, 최상위 `api/`, 프로젝트 전체 업로드 여부 |
| 주소창에서 API 접근 시 405 | 정상. 주소창은 GET이며 이 API는 POST만 허용 |
| 503 | 키 미설정, AI 중단 설정, 키·모델 접근 권한 |
| 429 | 자체 호출 제한 또는 OpenAI 사용 한도 |
| 502 / 504 | 외부 API 실패, 응답 형식 오류, 응답 대기시간 초과 |
| JSON 대신 HTML 또는 401/403 | Vercel 배포 보호, 잘못된 주소, 같은 출처 여부 |

Vercel 실제 번들링·라우팅·환경변수·도메인·배포 보호 설정은 아직 검증하지 않았습니다. 로컬 빌드와 테스트 통과만으로 배포 성공을 보장하지 않습니다.

## AI 처리와 비용 관리

브라우저는 `{ "coverageId": "demo-cancer" }`처럼 허용된 ID 하나만 전송합니다. 서버는 JSON 본문 256바이트, ID 64자 이하, 허용 ID·필드·메서드·출처를 검사합니다. 설명 대상은 서버의 고정 시연 자료에서 다시 조회합니다. 자유 입력, 전체 계약이나 개인정보를 모델에 전달하지 않습니다.

공식 OpenAI SDK의 Responses API를 호출하며 `store: false`, 구조화된 JSON 출력, 최대 출력 1,800토큰, SDK 자동 재시도 0회, SDK 대기 40초를 적용합니다. 브라우저 대기는 50초, Function 최대 시간은 60초입니다. 출력에는 추론 토큰도 포함될 수 있어 불완전한 결과는 성공으로 표시하지 않습니다.

기본 제한:

- 브라우저: 한 번에 1건, 요청 후 최소 3초 대기, 페이지 수명 동안 최대 12회
- Function 인스턴스: IP 해시별 분당 6회, 전체 생성 분당 30회, 동시 생성 최대 2건
- 동일 인스턴스의 모델·보장별 성공 결과 24시간 캐시, 동시 동일 요청 합치기
- SDK 오류 본문·키를 응답이나 로그로 출력하지 않고 안전한 오류 코드만 반환

**인메모리 제한은 완전한 비용 상한이 아닙니다.** 새 인스턴스·재시작·여러 리전에서는 카운터와 캐시가 공유되지 않고, 브라우저 새로고침으로 화면 제한도 초기화됩니다. Origin 검사는 사용자 인증이 아니며 직접 HTTP 호출을 막지 못합니다. IP 해시는 짧게 메모리에만 보관하지만 익명성을 보장하지 않습니다.

수업 공개 범위에 맞춰 Vercel 배포 보호·방화벽 제한을 사용하고, OpenAI 프로젝트의 모델별 한도·사용량·예산 알림을 확인하세요. 예산 알림을 강제 결제 차단으로 간주하지 마세요. 필요하면 `AI_DISABLED=true`로 설정 후 다시 배포해 호출을 중단하세요. 공개 운영에는 인스턴스 간 공유 제한과 인증을 별도로 설계해야 합니다. 오류·대기시간 초과 시에도 외부 요청이 이미 처리됐다면 비용이 발생할 수 있습니다.

## 향후 발전 방향 — 이번 버전에는 미구현

- 금융 마이데이터를 통한 실제 보험가입 내역 자동 조회
- 보험증권 PDF 업로드를 통한 조회 누락 계약 보완
- 새 보험 가입 시 자동 업데이트
- 기존 보험과 최신 보험상품 정보 비교
- 질병관리청 등 신뢰할 수 있는 의학정보를 참고한 보장 이해 지원
- 보험 선택을 돕는 비교 도구. 실제 추천 또는 적정성 판정은 이번 범위에서 제외

## 구현 참고 자료

- [OpenAI 공식 SDK 시작하기](https://developers.openai.com/api/docs/quickstart)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel 설정](https://vercel.com/docs/project-configuration/vercel-json)
- [Vercel Function의 파일 포함](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)
