import { readFile, mkdir, open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getAccessToken } from '../../functions/lib/googleAuth'
import { hash, requests, verify, type Plan, type Snapshot } from './core'

export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T }
export async function privateJson(path: string, value: unknown): Promise<void> {
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + '\n')
    await file.sync()
  } finally { await file.close() }
}
export async function privateDir(path: string): Promise<string> {
  const absolute = resolve(path)
  await mkdir(absolute, { mode: 0o700, recursive: false })
  return absolute
}
export async function googleClient(write: boolean) {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? (process.env.GOOGLE_APPLICATION_CREDENTIALS ? await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8') : '')
  if (!key) throw new Error('GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_KEY required')
  const token = await getAccessToken({ GOOGLE_SERVICE_ACCOUNT_KEY: key }, `https://www.googleapis.com/auth/spreadsheets${write ? '' : '.readonly'}`)
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60_000),
    })
    // Do not expose provider response bodies containing production data/tokens.
    if (!response.ok) throw new Error(`Google Sheets HTTP ${response.status}; do not retry a write before inspecting current state`)
    return response.json() as Promise<Snapshot>
  }
  return {
    read: (id: string): Promise<Snapshot> => call(`${encodeURIComponent(id)}?includeGridData=true`),
    write: async (id: string, batch: unknown[]) => { if (!write) throw new Error('Read-only client'); await call(`${encodeURIComponent(id)}:batchUpdate`, { requests: batch }) },
  }
}
export interface Client { read(id: string): Promise<Snapshot>; write(id: string, batch: unknown[]): Promise<void> }
export async function applyPlan(client: Client, before: Snapshot, plan: Plan, save: (name: string, data: unknown) => Promise<void>): Promise<void> {
  if (hash(before) !== plan.sourceHash || before.spreadsheetId !== plan.spreadsheetId) throw new Error('Backup/plan mismatch')
  const live = await client.read(plan.spreadsheetId)
  if (hash(live) !== plan.sourceHash) throw new Error('Source changed since planning; create/review a new plan')
  const batch = requests(plan, live)
  // Durable intent is written BEFORE the only atomic write. No automatic retries.
  await save('apply-intent.json', { planHash: hash(plan), sourceHash: plan.sourceHash, requestCount: batch.length })
  if (batch.length) await client.write(plan.spreadsheetId, batch)
  const after = await client.read(plan.spreadsheetId)
  await save('after.json', after)
  verify(before, after, plan)
  await save('verification.json', { passed: true, planHash: hash(plan), beforeHash: hash(before), afterHash: hash(after), googleEvaluated: true, checkedAt: new Date().toISOString() })
}
