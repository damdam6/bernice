import { it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

it('CLI defaults to offline no-write dry-run, keeps private artifacts, refuses unconfirmed apply and tampered plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bernice-migration-test-'))
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate-events.ts', ...args], { cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '', GOOGLE_SERVICE_ACCOUNT_KEY: '' } })
  try {
    const tables = [
      ['버니스명단', [['이름', '상태'], ['합성선수', '활동']]],
      ['목표', [['종목', '목표', '만점', '방향', '종료 회차'], ['슛', '3', '5', '높을수록', '']]],
      ['2026-09-01', [['이름', '슛'], ['합성선수', '4']]],
    ] as const
    const snapshot = { spreadsheetId: 'test-only', sheets: tables.map(([title, rows], i) => ({ properties: { title, sheetId: i, gridProperties: { rowCount: 10, columnCount: 8 } }, data: [{ rowData: rows.map(row => ({ values: row.map(value => ({ userEnteredValue: { stringValue: value }, effectiveValue: { stringValue: value }, formattedValue: value })) })) }] })) }
    const input = join(dir, 'source.json'), output = join(dir, 'run')
    writeFileSync(input, JSON.stringify(snapshot))
    const result = run('--snapshot', input, '--editors', 'owner@example.test', '--out', output)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Dry-run saved')
    expect(readdirSync(output).sort()).toEqual(['before.json', 'plan.json', 'requests.json', 'review.json'])
    expect(statSync(join(output, 'before.json')).mode & 0o777).toBe(0o600)
    expect(statSync(output).mode & 0o777).toBe(0o700)
    expect(JSON.parse(readFileSync(input, 'utf8'))).toEqual(snapshot)
    const unconfirmed = run('--mode', 'apply', '--run', output)
    expect(unconfirmed.status).toBe(1)
    expect(unconfirmed.stderr).toContain('Requires --writes-frozen')
    expect(readdirSync(output)).not.toContain('apply-intent.json')
    const plan = JSON.parse(readFileSync(join(output, 'plan.json'), 'utf8'))
    plan.edits[0].after = { stringValue: 'tampered' }
    writeFileSync(join(output, 'plan.json'), JSON.stringify(plan))
    const tampered = run('--mode', 'apply', '--run', output)
    expect(tampered.status).toBe(1)
    expect(tampered.stderr).toContain('deterministic regeneration')
    expect(readdirSync(output)).not.toContain('apply-intent.json')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 20_000)
