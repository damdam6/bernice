// 서비스계정 JWT(RS256) 서명 + 구글 액세스 토큰 발급/캐시.
// Workers 런타임에는 node:crypto가 없어 crypto.subtle(Web Crypto)만 사용한다.

interface Env {
  GOOGLE_SERVICE_ACCOUNT_KEY: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// 실제 만료보다 여유를 두고 미리 갱신 (Google 액세스 토큰 수명은 보통 3600초).
const EXPIRY_MARGIN_SECONDS = 300;

// scope별 in-flight/완료 Promise. 동시 호출이 같은 Promise로 수렴해 중복 발급을 막는다.
const tokenCache = new Map<string, Promise<CachedToken>>();

export async function getAccessToken(env: Env, scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached) {
    const token = await cached;
    if (token.expiresAt > Date.now()) return token.accessToken;
  }

  const fresh = issueAccessToken(env, scope);
  tokenCache.set(scope, fresh);
  fresh.catch(() => tokenCache.delete(scope));

  const token = await fresh;
  return token.accessToken;
}

async function issueAccessToken(env: Env, scope: string): Promise<CachedToken> {
  const serviceAccount = parseServiceAccountKey(env);
  const assertion = await signServiceAccountJwt(serviceAccount, scope);

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`구글 액세스 토큰 발급 실패 (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in - EXPIRY_MARGIN_SECONDS) * 1000,
  };
}

function parseServiceAccountKey(env: Env): ServiceAccountKey {
  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 설정되지 않았습니다.');
  }

  let parsed: Partial<ServiceAccountKey>;
  try {
    parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch (e) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY가 올바른 JSON이 아닙니다: ${(e as Error).message}`);
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY에 client_email/private_key가 없습니다.');
  }

  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

async function signServiceAccountJwt(sa: ServiceAccountKey, scope: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(claims)}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
