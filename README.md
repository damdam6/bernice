# 🏀 버니스 실력 기록

버니스 농구팀의 3개월 주기 실력 테스트 기록을 관리·시각화하는 사이트.
설계 문서는 [`docs/`](docs/index.html), 단계별 계획은 [`docs/build-plan.html`](docs/build-plan.html) 참고.

## 스택

Vite + React + TypeScript · Tailwind CSS v4 · Cloudflare Pages + Pages Functions · Google Sheets(서비스계정)

## 개발

```bash
npm install
cp .dev.vars.example .dev.vars   # 실값 채우기 (아래 시크릿 참고)

npm run dev:all   # 빌드 후 vite(5173) + wrangler pages dev(8788) 동시 실행
```

- 개발 중 UI는 http://localhost:5173 (HMR), `/api/*`는 vite 프록시로 8788의 Pages Functions에 위임.
- 따로 띄우려면: `npm run build`(최초 1회, dist 필요) → `npm run dev:api` + `npm run dev`.
- 배포 산출물 확인: `npm run build` 후 `npx wrangler pages dev --port 8788` → http://localhost:8788

## 시크릿 (.dev.vars — 커밋 금지)

| 키 | 값 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 서비스계정 키 JSON 한 줄 (`jq -c . secrets/<키파일>.json`) |
| `TEAM_PASSCODE` | 팀 공용 패스코드 (P2에서 사용) |
| `ADMIN_CODE` | 관리자 코드 (P5에서 사용) |

프로덕션은 Cloudflare Pages Secret으로 설정 (`wrangler pages secret put <키>`).

## 배포 (Cloudflare Pages)

`wrangler.jsonc`에 빌드 산출물(`dist/`)이 설정돼 있다. 최초 1회 프로젝트 연결:

```bash
npx wrangler login
npx wrangler pages project create bernice
npx wrangler pages deploy        # 또는 대시보드에서 GitHub 연동
```

## 레포 구조

```
src/        React 앱
functions/  Pages Functions (/api/*)
docs/       설계 문서 (HTML)
scripts/    구글 시트 시딩·보호 스크립트 (일회성)
```
