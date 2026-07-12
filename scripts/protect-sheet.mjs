// 이름 열 + 첫 행(헤더)을 보호 범위로 잠근다.
//   · 편집 가능: 소유자(OWNER_EMAIL) + 서비스 계정 (우리 스크립트)
//   · 그 외 편집자(팀원 등)는 해당 칸 수정 불가 → 참조 수식 보호
//   · 회차 탭을 복제하면 보호 범위도 함께 복사됨 (새 회차 자동 보호)
//   · 멱등: 기존 보호를 지우고 다시 설정
//
// 실행:
//   GOOGLE_APPLICATION_CREDENTIALS=./secrets/sa-key.json \
//   OWNER_EMAIL=dambi626626@gmail.com \
//   SHEET_ID=1Emv2rbm1vakp2aEUfLD2V9GTmghHQ2SdaNqPwMBZNDw \
//   node scripts/protect-sheet.mjs

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const SHEET_ID = process.env.SHEET_ID || '1Emv2rbm1vakp2aEUfLD2V9GTmghHQ2SdaNqPwMBZNDw';
const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/sa-key.json';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'dambi626626@gmail.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// 각 탭에서 잠글 범위. cols 는 헤더 폭.
const LOCK = {
  '버니스명단': { headerCols: 2, nameCol: true },   // 헤더행 + 이름열(A)
  '목표': { headerCols: 4, nameCol: false },       // 헤더행만
  '2025-05-16': { headerCols: 5, nameCol: true },  // 헤더행 + 이름열(A)
};

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const si = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`;
  const sig = b64url(createSign('RSA-SHA256').update(si).end().sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${si}.${sig}` }),
  });
  if (!res.ok) throw new Error(`토큰 발급 실패 ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

const api = (token) => async (path, init = {}) => {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
};

async function main() {
  const sa = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  console.log(`▸ 편집 허용: ${OWNER_EMAIL} (소유자) + ${sa.client_email} (서비스 계정)`);
  const call = api(await getAccessToken(sa));
  const editors = { users: [OWNER_EMAIL, sa.client_email] };

  // 탭 sheetId + 기존 보호 범위 조회
  const meta = await call(`${SHEET_ID}?fields=sheets(properties(sheetId,title),protectedRanges(protectedRangeId))`);
  const requests = [];

  // 1) 기존 보호 전부 삭제 (멱등)
  for (const s of meta.sheets) {
    for (const p of (s.protectedRanges || [])) {
      requests.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } });
    }
  }

  // 2) 새 보호 추가
  for (const s of meta.sheets) {
    const title = s.properties.title;
    const sheetId = s.properties.sheetId;
    const spec = LOCK[title];
    if (!spec) continue;
    // 헤더행(1행)
    requests.push({ addProtectedRange: { protectedRange: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: spec.headerCols },
      description: `${title} 헤더 잠금`, warningOnly: false, editors,
    } } });
    // 이름열(A, 2행부터)
    if (spec.nameCol) {
      requests.push({ addProtectedRange: { protectedRange: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        description: `${title} 이름열 잠금`, warningOnly: false, editors,
      } } });
    }
  }

  await call(`${SHEET_ID}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  console.log(`✅ 보호 적용 완료 (삭제 ${requests.filter(r => r.deleteProtectedRange).length}건 / 추가 ${requests.filter(r => r.addProtectedRange).length}건)`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
