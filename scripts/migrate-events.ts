import { parseArgs } from 'node:util'
import { resolve, join, dirname } from 'node:path'
import { realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createPlan, hash, requests, verify, rollbackPlan, assertEqual, type Snapshot, type Plan } from './migration/core'
import { applyPlan, googleClient, privateDir, privateJson, readJson } from './migration/io'

const HELP = `Event identity migration (default: read-only dry-run)
  npm run migrate:events -- --sheet SHEET_ID --editors owner@example.com,sa@example.com --out /private/run
  npm run migrate:events -- --snapshot /private/snapshot.json --editors EMAILS --out /private/offline
  npm run migrate:events -- --mode apply --run /private/run --confirm SHEET_ID --approved-plan HASH --writes-frozen
  npm run migrate:events -- --mode verify --run /private/run --out /private/verification
  npm run migrate:events -- --mode rollback --run /private/run --out /private/rollback-plan
Rollback only creates a new dry-run plan; apply it separately with the same confirmations.
Live dry-run uses a readonly scope. apply is the ONLY write command.
The output directory must be new and outside the repository. Never commit production snapshots.
`
async function main() {
  const { values: args } = parseArgs({ options: {
    mode: { type: 'string', default: 'dry-run' }, sheet: { type: 'string' }, snapshot: { type: 'string' }, editors: { type: 'string' }, out: { type: 'string' }, run: { type: 'string' }, confirm: { type: 'string' }, 'approved-plan': { type: 'string' }, 'writes-frozen': { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (args.help) { console.log(HELP); return }
  const mode = args.mode!
  if (!['dry-run', 'apply', 'verify', 'rollback'].includes(mode)) throw new Error('Unknown mode')
  const repo = await realpath(resolve(fileURLToPath(import.meta.url), '..', '..'))
  const output = async () => {
    if (!args.out) throw new Error('--out required (new private directory)')
    const path = resolve(args.out)
    const parent = await realpath(dirname(path))
    if (path === repo || path.startsWith(repo + '/') || parent === repo || parent.startsWith(repo + '/')) throw new Error('Output must be outside repository')
    return privateDir(path)
  }
  if (mode === 'dry-run') {
    if (!!args.sheet === !!args.snapshot) throw new Error('Choose exactly one: --sheet or --snapshot')
    const client = args.sheet ? await googleClient(false) : undefined
    const before = client ? await client.read(args.sheet!) : await readJson<Snapshot>(args.snapshot!)
    if (client && hash(before) !== hash(await client.read(args.sheet!))) throw new Error('Source changed while backing up; freeze writes and retry')
    const dir = await output()
    // Save full values, formulas, formats, protections before mapping validation.
    await privateJson(join(dir, 'before.json'), before)
    const plan = createPlan(before, (args.editors ?? '').split(',').filter(Boolean))
    await privateJson(join(dir, 'plan.json'), plan)
    await privateJson(join(dir, 'requests.json'), requests(plan, before))
    await privateJson(join(dir, 'review.json'), { planHash: hash(plan), sourceHash: hash(before), spreadsheetId: before.spreadsheetId, liveBackup: !!client, actualGoogleValidation: false, edits: plan.edits, mapping: plan.mapping, addedProtections: plan.protections, productionApproved: false })
    console.log(`Dry-run saved. ${plan.edits.length} cell edits, ${plan.protections.length} protections. Plan hash: ${hash(plan)}`)
    return
  }
  if (!args.run) throw new Error('--run required')
  const before = await readJson<Snapshot>(join(args.run, 'before.json'))
  const plan = await readJson<Plan>(join(args.run, 'plan.json'))
  if (hash(before) !== plan.sourceHash) throw new Error('Backup hash mismatch')
  // Never execute arbitrary requests read from disk. Regenerate and compare the plan.
  if (plan.kind === 'migrate') assertEqual(plan, createPlan(before, plan.editors), 'Plan differs from deterministic regeneration')
  else {
    const origin = await readJson<{ before: Snapshot; plan: Plan }>(join(args.run, 'rollback-origin.json'))
    assertEqual(origin.plan, createPlan(origin.before, origin.plan.editors), 'Original migration plan differs from regeneration')
    assertEqual(plan, rollbackPlan(origin.before, before, origin.plan), 'Rollback plan differs from regeneration')
  }
  if (mode === 'apply') {
    if (!args['writes-frozen'] || args.confirm !== plan.spreadsheetId || args['approved-plan'] !== hash(plan)) throw new Error('Requires --writes-frozen, --confirm exact sheet ID and --approved-plan reviewed hash')
    await applyPlan(await googleClient(true), before, plan, (name, value) => privateJson(join(args.run!, name), value))
    console.log('Google read-back and data preservation verified. Keep writes frozen until cache/app/permission checks pass.')
  } else if (mode === 'verify') {
    const after = await (await googleClient(false)).read(plan.spreadsheetId)
    const dir = await output()
    await privateJson(join(dir, 'after.json'), after)
    verify(before, after, plan)
    await privateJson(join(dir, 'verification.json'), { passed: true, googleEvaluated: true, planHash: hash(plan), afterHash: hash(after) })
    console.log('Verified against live Google evaluation.')
  } else {
    const current = await (await googleClient(false)).read(plan.spreadsheetId)
    const rollback = rollbackPlan(before, current, plan)
    const dir = await output()
    await privateJson(join(dir, 'before.json'), current)
    await privateJson(join(dir, 'plan.json'), rollback)
    await privateJson(join(dir, 'rollback-origin.json'), { before, plan })
    await privateJson(join(dir, 'requests.json'), requests(rollback, current))
    console.log(`Rollback dry-run saved; scores will not be written. Plan hash: ${hash(rollback)}`)
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Migration failed'); process.exitCode = 1 })
