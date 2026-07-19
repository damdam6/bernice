// ⚠️ 일회성 시딩 스크립트. 재실행하면 전 탭을 리셋하고 하드코딩 데이터로 덮어쓴다
//    (수동으로 바꾼 상태·정렬·추가 데이터가 전부 사라짐). 이미 시딩 완료됨 — 함부로 재실행 금지.
//
// 서비스 계정으로 구글 시트를 구성/시딩한다.
//   · 구조: 이름으로 참조 (회차 시트에 수기 id 없음, 이름 드롭다운 = 버니스명단 참조)
//   · 서식: 1행+1열 고정, 헤더/이름열 색상
//   · 드롭다운: 버니스명단 상태(활동/탈퇴/비대상/휴식), 목표 방향(낮을수록/높을수록), 회차 이름(버니스명단 참조)
//   · 의존성 없음 — Node 23.6+ (내장 crypto + fetch, shared/domain.ts는 TS type-stripping으로 import)
//
// 실행:
//   GOOGLE_APPLICATION_CREDENTIALS=./secrets/sa-key.json \
//   SHEET_ID=1Emv2rbm1vakp2aEUfLD2V9GTmghHQ2SdaNqPwMBZNDw \
//   node scripts/seed-sheet.mjs

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { PLAYER_STATUSES, RANK_DIRECTIONS } from '../shared/domain.ts';

const SHEET_ID = process.env.SHEET_ID || '1Emv2rbm1vakp2aEUfLD2V9GTmghHQ2SdaNqPwMBZNDw';
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/sa-key.json';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// --- 시딩 데이터 -------------------------------------------------------------
const TAB_TITLES = ['버니스명단', '목표', '2025-05-16'];
const TAB_COLS = { '버니스명단': 2, '목표': 4, '2025-05-16': 5 };

// 버니스명단·목표: 수식 없음 → RAW ("1:17" 등 텍스트 보존)
const SIMPLE_TABS = {
  // 이름 | 상태  (이름이 곧 참조 키. 행 위치 = 고정 신원)
  '버니스명단': [
    ['이름', '상태'],
    ['선수1', '활동'], ['선수2', '활동'], ['선수3', '활동'], ['선수4', '활동'],
    ['선수5', '활동'], ['선수6', '활동'], ['선수7', '활동'], ['선수8', '활동'],
    ['선수9', '활동'], ['선수10', '활동'], ['선수11', '활동'], ['선수12', '활동'],
    ['선수13', '활동'], ['선수14', '활동'], ['선수15', '활동'], ['선수16', '활동'],
    ['선수17', '활동'], ['선수18', '활동'], ['선수19', '활동'], ['선수20', '활동'],
    ['선수21', '활동'],
  ],
  '목표': [
    ['종목', '목표', '만점', '방향'],
    ['드리블셔틀런', '1:17', '', '낮을수록'],
    ['골밑슛', 5, 10, '높을수록'],
    ['자유투', 2, 5, '높을수록'],
    ['45도패스캐치', 5, 7, '높을수록'],
  ],
};

// 명단 행 수 (버니스명단 데이터 행 = 21명). 회차 이름 열이 이 수만큼 참조.
const ROSTER_ROWS = SIMPLE_TABS['버니스명단'].length - 1; // 21

// 회차 점수 헤더
const SESSION_TAB = '2025-05-16';
const SCORE_HEADER = ['드리블셔틀런', '골밑슛', '자유투', '45도패스캐치'];
// 참여자 점수 — 버니스명단 행 순서(선수1..선수6 = 첫 6명)와 1:1 대응 (합성 예시 데이터)
const SESSION_SCORES = [
  ['1:12', 5, 2, 6],   // 선수1
  ['1:14', 6, 1, 7],   // 선수2
  ['1:10', 7, 3, 7],   // 선수3
  ['1:22', 4, 2, 5],   // 선수4
  ['1:16', 8, 2, '면제'], // 선수5
  ['1:19', 6, 3, 6],   // 선수6
];

// --- 색상 (0~1 float) --------------------------------------------------------
const HEADER_BG = { red: 0.910, green: 0.384, blue: 0.227 }; // 농구 오렌지
const HEADER_FG = { red: 1, green: 1, blue: 1 };
const FIRSTCOL_BG = { red: 0.984, green: 0.906, blue: 0.867 }; // 옅은 오렌지 틴트

// --- 서비스 계정 JWT → access token -----------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const si = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`;
  const sig = b64url(createSign('RSA-SHA256').update(si).end().sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${si}.${sig}` }),
  });
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

const api = (token) => async (path, init = {}) => {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
};

async function main() {
  let sa;
  try { sa = JSON.parse(readFileSync(KEY_PATH, 'utf8')); }
  catch (e) { throw new Error(`서비스 계정 키를 못 읽음 (${KEY_PATH}). 원인: ${e.message}`); }
  console.log(`▸ 서비스 계정: ${sa.client_email}`);
  console.log(`▸ 대상 시트: ${SHEET_ID}`);

  const call = api(await getAccessToken(sa));

  // 탭 목록 확인 + 없는 탭 생성
  let meta = await call(`${SHEET_ID}?fields=sheets.properties(sheetId,title)`);
  let existing = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const wanted = TAB_TITLES;

  const setup = [];
  const firstId = meta.sheets[0]?.properties?.sheetId;
  const firstTitle = meta.sheets[0]?.properties?.title;
  if (firstId != null && meta.sheets.length === 1 && !wanted.includes(firstTitle)) {
    setup.push({ updateSheetProperties: { properties: { sheetId: firstId, title: wanted[0] }, fields: 'title' } });
  }
  for (const t of wanted) if (!existing.has(t)) setup.push({ addSheet: { properties: { title: t } } });
  if (setup.length) await call(`${SHEET_ID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: setup }) });

  // sheetId 재확보
  meta = await call(`${SHEET_ID}?fields=sheets.properties(sheetId,title)`);
  const idOf = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));

  // 1) 리셋 — 기존 값/서식/데이터확인 모두 제거 (구조 변경 잔재 정리)
  const resetReqs = wanted.map((t) => ({
    repeatCell: { range: { sheetId: idOf.get(t) }, cell: {}, fields: 'userEnteredValue,userEnteredFormat,dataValidation' },
  }));
  await call(`${SHEET_ID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: resetReqs }) });
  console.log('▸ 기존 탭 리셋 완료');

  // 2a) 버니스명단·목표 값 기록 (RAW)
  for (const [title, values] of Object.entries(SIMPLE_TABS)) {
    const range = `${title}!A1`;
    await call(`${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ range, majorDimension: 'ROWS', values }) });
    console.log(`  ✓ ${title} 값 (${values.length}행)`);
  }

  // 2b) 회차 헤더행(USER_ENTERED): 이름 + 종목명은 목표 탭 참조 (='목표'!A2..A5)
  const drillRefs = SCORE_HEADER.map((_, i) => `='목표'!A${i + 2}`);
  await call(`${SHEET_ID}/values/${encodeURIComponent(`${SESSION_TAB}!A1`)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ range: `${SESSION_TAB}!A1`, majorDimension: 'ROWS', values: [['이름', ...drillRefs]] }) });

  // 2c) 회차 이름 열(USER_ENTERED): 버니스명단 참조 수식, 명단 전원 미러링
  const nameCol = Array.from({ length: ROSTER_ROWS }, (_, i) => [`='버니스명단'!A${i + 2}`]);
  await call(`${SHEET_ID}/values/${encodeURIComponent(`${SESSION_TAB}!A2`)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ range: `${SESSION_TAB}!A2`, majorDimension: 'ROWS', values: nameCol }) });
  console.log(`  ✓ ${SESSION_TAB} 헤더 종목 참조 + 이름 참조(${ROSTER_ROWS}명 미러링)`);

  // 2d) 회차 점수 블록 B2:E?(RAW). 참여자만, 미참여자는 빈칸 유지.
  await call(`${SHEET_ID}/values/${encodeURIComponent(`${SESSION_TAB}!B2`)}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ range: `${SESSION_TAB}!B2`, majorDimension: 'ROWS', values: SESSION_SCORES }) });
  console.log(`  ✓ ${SESSION_TAB} 점수 (참여자 ${SESSION_SCORES.length}명)`);

  // 3) 서식/고정/드롭다운
  const fmt = [];
  for (const t of wanted) {
    const sheetId = idOf.get(t);
    const cols = TAB_COLS[t];
    // 1행 + 1열 고정
    fmt.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } });
    // 헤더(1행) 색상
    fmt.push({ repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: { userEnteredFormat: { backgroundColor: HEADER_BG, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', textFormat: { bold: true, foregroundColor: HEADER_FG } } },
      fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)',
    } });
    // 1열 색상(2행부터)
    fmt.push({ repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { backgroundColor: FIRSTCOL_BG, textFormat: { bold: true } } },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    } });
  }
  // 버니스명단 상태 드롭다운 (B열)
  fmt.push({ setDataValidation: {
    range: { sheetId: idOf.get('버니스명단'), startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 1, endColumnIndex: 2 },
    rule: { condition: { type: 'ONE_OF_LIST', values: PLAYER_STATUSES.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true },
  } });
  // 목표 방향 드롭다운 (D열)
  fmt.push({ setDataValidation: {
    range: { sheetId: idOf.get('목표'), startRowIndex: 1, endRowIndex: 100, startColumnIndex: 3, endColumnIndex: 4 },
    rule: { condition: { type: 'ONE_OF_LIST', values: RANK_DIRECTIONS.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: true },
  } });
  // (회차 이름 열은 드롭다운이 아니라 버니스명단 참조 수식 — 데이터확인 없음)

  await call(`${SHEET_ID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: fmt }) });
  console.log('  ✓ 고정·색상·드롭다운 적용');

  console.log('✅ 시트 구성 완료.');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
