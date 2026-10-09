import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { WopEnvironment, WopPicker, WopPlainWorktree, WopRisk } from '../types'
import {
  WOP_COMMAND,
  exitQuestion,
  fit,
  health,
  insideWorktree,
  matchesToolCall,
  parseGitWorktrees,
  plural,
  sameJson,
  serviceColor,
  warnings,
  webService,
  worktreesIn,
} from './text'
import type { RegistryEntry } from './text'

type Engine = EngineInterface

const environmentsState = atom({ plugin: 'wop-worktrees', key: 'environments' } as const, [])
const attachedState = atom({ plugin: 'wop-worktrees', key: 'attached' } as const, [])
const pendingState = atom({ plugin: 'wop-worktrees', key: 'pending' } as const, [])
const pickerState = atom({ plugin: 'wop-worktrees', key: 'picker' } as const, null)
const focusedState = atom({ plugin: 'wop-worktrees', key: 'focused' } as const, null)
const confirmingState = atom({ plugin: 'wop-worktrees', key: 'confirming' } as const, null)
const riskState = atom({ plugin: 'wop-worktrees', key: 'risk' } as const, null)

type Chat = { cwd: string; attached: string[] }

const PENDING_TTL_MS = 30 * 60_000
const CHAT_FRESH_MS = 60_000
const CHAT_BEAT_MS = 20_000
const STALE_CHAT_MS = 24 * 60 * 60_000
const STALE_ATTACHED_MS = 30 * 24 * 60 * 60_000

const databases = new Map<string, string>()
const mainCheckouts = new Map<string, string | null>()
let lastBeat = { text: '', at: 0 }

async function home($: Engine) {
  return (await $.env.get('HOME')) ?? ''
}

async function stateDir($: Engine) {
  return (await home($)) + '/.claude/wop-worktrees'
}

async function registryPath($: Engine) {
  return ((await $.env.get('WOP_STATE_DIR')) || (await home($)) + '/.config/devmanager') + '/registry.json'
}

async function markerPath($: Engine) {
  return (await stateDir($)) + '/claude-sessions/' + (await $.session.id())
}

async function chatsDir($: Engine) {
  return (await stateDir($)) + '/chats'
}

async function storeKey($: Engine) {
  return 'attached:' + (await $.session.id())
}

async function readEntries($: Engine): Promise<RegistryEntry[] | null> {
  try {
    return JSON.parse(await $.fs.read(await registryPath($))).entries ?? []
  } catch {
    return (await $.fs.exists(await registryPath($))) ? null : []
  }
}

async function sessionWorktree($: Engine) {
  const path = await markerPath($)
  if (!(await $.fs.exists(path))) return null
  return (await $.fs.read(path)).trim()
}

async function livePids($: Engine, pids: number[]) {
  if (pids.length === 0) return new Set<number>()
  const ps = await $.process.run(['ps', '-o', 'pid=', '-p', pids.join(',')])
  return new Set(ps.stdout.split('\n').map((line) => Number(line.trim())).filter(Boolean))
}

async function databaseName($: Engine, worktree: string) {
  const known = databases.get(worktree)
  if (known) return known
  let name: string | null = null
  try {
    name = (await $.fs.read(worktree + '/.env')).match(/^DATABASE_URL=\S*\/([^/\s?]+)/m)?.[1] ?? null
  } catch {}
  if (name) databases.set(worktree, name)
  return name
}

function forgetDatabase(worktree: string) {
  databases.delete(worktree)
}

async function mainCheckout($: Engine, cwd: string) {
  const known = mainCheckouts.get(cwd)
  if (known !== undefined) return known
  const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd })
  const commonDir = git.exitCode === 0 ? git.stdout.trim() : null
  const main = commonDir ? commonDir.slice(0, commonDir.lastIndexOf('/')) : null
  mainCheckouts.set(cwd, main)
  return main
}

async function saveAttached($: Engine, worktrees: string[]) {
  await update($, attachedState, () => worktrees)
  await $.store.set(await storeKey($), { worktrees, at: await $.clock.now() })
}

async function restoreAttached($: Engine) {
  const saved = (await $.store.get(await storeKey($))) as { worktrees?: string[] } | undefined
  if (saved?.worktrees) await update($, attachedState, () => saved.worktrees ?? [])
}

async function attachFromToolCall($: Engine, toolCall: unknown) {
  const text = JSON.stringify(toolCall)
  if (WOP_COMMAND.test(text)) {
    const until = (await $.clock.now()) + PENDING_TTL_MS
    await update($, pendingState, (pending) => [...pending, { text, until }])
  }
  const entries = (await readEntries($)) ?? []
  const touched = worktreesIn(entries.filter((entry) => matchesToolCall(text, entry)))
  const attached = await read($, attachedState)
  if (touched.some((worktree) => !attached.includes(worktree))) await saveAttached($, [...new Set([...attached, ...touched])])
}

async function attach($: Engine, cwd: string, entries: RegistryEntry[]) {
  const registered = worktreesIn(entries)
  const now = await $.clock.now()
  const pending = (await read($, pendingState)).filter((mention) => mention.until > now)
  const matched = (text: string) => entries.some((entry) => matchesToolCall(text, entry))
  const fromPending = worktreesIn(entries.filter((entry) => pending.some((mention) => matchesToolCall(mention.text, entry))))
  const here = registered.filter((worktree) => insideWorktree(cwd, worktree))
  const before = await read($, attachedState)
  const attached = [...new Set([...before, ...fromPending, ...here])].filter((worktree) => registered.includes(worktree))
  const waiting = pending.filter((mention) => !matched(mention.text))

  if (!sameJson(waiting, await read($, pendingState))) await update($, pendingState, () => waiting)
  if (!sameJson(attached, before)) await saveAttached($, attached)
  return attached
}

async function beat($: Engine, cwd: string, attached: string[]) {
  const text = JSON.stringify({ cwd, attached })
  const now = await $.clock.now()
  if (text === lastBeat.text && now - lastBeat.at < CHAT_BEAT_MS) return
  await $.fs.write((await chatsDir($)) + '/' + (await $.session.id()) + '.json', text)
  lastBeat = { text, at: now }
}

async function otherChats($: Engine) {
  const dir = await chatsDir($)
  const own = (await $.session.id()) + '.json'
  const now = await $.clock.now()
  let files: Awaited<ReturnType<Engine['fs']['list']>> = []
  try {
    files = await $.fs.list(dir)
  } catch {
    return []
  }
  const fresh = files.filter((file) => file.kind === 'file' && file.name !== own && now - file.mtimeMs < CHAT_FRESH_MS)
  const chats = await Promise.all(
    fresh.map(async (file) => {
      try {
        return JSON.parse(await $.fs.read(dir + '/' + file.name)) as Chat
      } catch {
        return null
      }
    }),
  )
  return chats.filter((chat) => chat !== null)
}

async function endChat($: Engine) {
  await $.process.run(['rm', '-f', (await chatsDir($)) + '/' + (await $.session.id()) + '.json'])
}

async function describeAll($: Engine, entries: RegistryEntry[], cwd: string, attached: string[], main: string | null) {
  const alive = await livePids($, entries.map((entry) => entry.pid ?? 0).filter(Boolean))
  const claudeWorktree = await sessionWorktree($)
  const chats = await otherChats($)
  return Promise.all(
    worktreesIn(entries).map(async (worktree): Promise<WopEnvironment> => {
      const own = entries.filter((entry) => entry.worktree_path === worktree)
      const first = own[0] as RegistryEntry
      return {
        worktree,
        branch: first.branch,
        project: first.project_path,
        database: await databaseName($, worktree),
        missing: !(await $.fs.exists(worktree)),
        claudeWorktree: claudeWorktree === worktree,
        current: insideWorktree(cwd, worktree),
        attached: attached.includes(worktree),
        inProject: first.project_path === main,
        otherChats: chats.filter((chat) => insideWorktree(chat.cwd, worktree) || chat.attached.includes(worktree)).length,
        services: own.map((entry) => ({ name: entry.service, port: entry.port, cmd: entry.cmd ?? '', running: alive.has(entry.pid ?? 0) })),
      }
    }),
  )
}

async function refresh($: Engine) {
  const entries = await readEntries($)
  if (entries === null) return
  const cwd = await $.session.cwd()
  const attached = await attach($, cwd, entries)
  await beat($, cwd, attached)
  const main = await mainCheckout($, cwd)
  const described = await describeAll($, entries, cwd, attached, main)
  const environments = described.filter((environment) => environment.inProject || environment.current || environment.attached)
  if (!sameJson(environments, await read($, environmentsState))) await update($, environmentsState, () => environments)
}

async function prune($: Engine) {
  const now = await $.clock.now()
  for (const key of await $.store.keys()) {
    const saved = (await $.store.get(key)) as { at?: number } | undefined
    if (key.startsWith('attached:') && now - (saved?.at ?? 0) > STALE_ATTACHED_MS) await $.store.delete(key)
  }

  const dir = await chatsDir($)
  const stale = (await $.fs.list(dir).catch(() => [])).filter((file) => now - file.mtimeMs > STALE_CHAT_MS)
  if (stale.length > 0) await $.process.run(['rm', '-f', ...stale.map((file) => dir + '/' + file.name)])

  const entries = await readEntries($)
  if (entries === null) return
  const registered = worktreesIn(entries)
  const markers = (await stateDir($)) + '/claude-sessions'
  const orphans: string[] = []
  for (const file of await $.fs.list(markers).catch(() => [])) {
    const path = (await $.fs.read(markers + '/' + file.name).catch(() => '')).trim()
    if (!registered.includes(path)) orphans.push(markers + '/' + file.name)
  }
  if (orphans.length > 0) await $.process.run(['rm', '-f', ...orphans])
}

async function runWop($: Engine, environment: WopEnvironment, action: 'restart' | 'stop' | 'down') {
  await $.process.run(['wop', action, environment.branch], { cwd: environment.project, timeoutMs: 300_000 })
  if (action === 'down' && environment.claudeWorktree) await $.process.run(['rm', '-f', await markerPath($)])
  if (action === 'down') forgetDatabase(environment.worktree)
}

async function worktreeRisk($: Engine, path: string, ignored: readonly string[]): Promise<WopRisk> {
  try {
    if (!(await $.fs.exists(path))) return { changes: 0, unpushed: 0, failed: false }
    const status = await $.process.run(['git', 'status', '--porcelain'], { cwd: path })
    const changes = status.stdout.split('\n').filter((line) => line.trim() !== '' && !ignored.includes(line.slice(3))).length
    const commits = await $.process.run(['git', 'rev-list', '--count', 'HEAD', '--not', '--remotes'], { cwd: path })
    return { changes, unpushed: Number(commits.stdout.trim()) || 0, failed: status.exitCode !== 0 }
  } catch {
    return { changes: 0, unpushed: 0, failed: true }
  }
}

function serviceLogs(environment: WopEnvironment) {
  return environment.services.map((service) => service.name + '.log')
}

type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

const PICKER = 'wop-worktrees'
const CYCLE_ACTION = 'app:cycleDiffBase'

type View = {
  picker: WopPicker | null
  wop: WopEnvironment[]
  focused: string | null
  confirming: string | null
  risk: WopRisk | null
}

type Removal =
  | { kind: 'wop'; key: string; environment: WopEnvironment }
  | { kind: 'plain'; key: string; worktree: WopPlainWorktree; main: string }

type PlainRow = { key: string; icon: string; label: string; current: boolean; onPress: () => void }

async function readView($: Engine): Promise<View> {
  return {
    picker: await read($, pickerState),
    wop: (await read($, environmentsState))
      .filter((environment) => environment.inProject)
      .sort((left, right) => left.branch.localeCompare(right.branch)),
    focused: await read($, focusedState),
    confirming: await read($, confirmingState),
    risk: await read($, riskState),
  }
}

async function loadPicker($: Engine): Promise<WopPicker> {
  const cwd = await $.session.cwd()
  const main = await mainCheckout($, cwd)
  if (!main) return { main: null, plain: [] }

  const listing = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: main })
  const worktrees = parseGitWorktrees(listing.stdout).filter((worktree) => worktree.path !== main)
  const wopPaths = new Set((await read($, environmentsState)).map((environment) => environment.worktree))

  return {
    main: { path: main, current: !worktrees.some((worktree) => insideWorktree(cwd, worktree.path)) },
    plain: worktrees
      .filter((worktree) => !wopPaths.has(worktree.path))
      .map((worktree) => ({ ...worktree, current: insideWorktree(cwd, worktree.path) })),
  }
}

async function reloadPicker($: Engine) {
  await refresh($)
  const picker = await loadPicker($)
  await update($, pickerState, () => picker)
  await update($, focusedState, () => null)
}

function currentRowKey(view: View) {
  return view.wop.find((environment) => environment.current)?.worktree ?? view.picker?.plain.find((worktree) => worktree.current)?.path ?? 'main'
}

async function openPicker($: Engine) {
  await update($, pickerState, () => null)
  await update($, confirmingState, () => null)
  await update($, focusedState, () => null)
  await $.ui.open({ id: PICKER, title: 'wop worktrees', focus: true, closeOnEscape: true })
  await reloadPicker($)
  try {
    await $.ui.focus({ requestId: PICKER, key: currentRowKey(await readView($)) })
  } catch {}
}

async function closePicker($: Engine) {
  await $.ui.close({ id: PICKER })
}

async function togglePicker($: Engine) {
  const isOpen = (await $.ui.panes()).some((pane) => pane.id === PICKER)
  return isOpen ? closePicker($) : openPicker($)
}

async function moveTo($: Engine, path: string, environment: WopEnvironment | null) {
  await closePicker($)
  if (environment?.services.some((service) => !service.running)) {
    $.ui.toast('Restarting ' + environment.branch + '…')
    await runWop($, environment, 'restart')
  }
  const attached = await read($, attachedState)
  if (environment && !attached.includes(environment.worktree)) await saveAttached($, [...attached, environment.worktree])
  await $.command.run({ command: 'cd', args: path })
  await refresh($)
}

function removalFor(view: View, key: string | null): Removal | null {
  if (!key) return null
  const environment = view.wop.find((candidate) => candidate.worktree === key)
  if (environment) return { kind: 'wop', key, environment }
  const worktree = view.picker?.plain.find((candidate) => candidate.path === key)
  const main = view.picker?.main?.path
  return worktree && main ? { kind: 'plain', key, worktree, main } : null
}

function removalText(removal: Removal) {
  if (removal.kind === 'wop') {
    const { branch, database } = removal.environment
    return {
      title: 'Tear down ' + branch + '?',
      detail: 'Deletes the worktree folder (uncommitted work included) and drops ' + (database ?? 'its database') + '.',
      confirmLabel: 'tear down',
    }
  }
  const { branch } = removal.worktree
  return {
    title: 'Remove ' + branch + '?',
    detail:
      'Deletes the worktree folder (uncommitted work included)' +
      (branch.startsWith('worktree-') ? ' and its throwaway branch.' : '. The branch stays.'),
    confirmLabel: 'remove',
  }
}

async function requestRemoval($: Engine) {
  const view = await readView($)
  if (view.focused === 'main') return $.ui.toast('The main checkout cannot be removed')
  const removal = removalFor(view, view.focused)
  if (!removal) return $.ui.toast('Move to a worktree first')

  await update($, confirmingState, () => removal.key)
  await update($, riskState, () => null)
  const risk =
    removal.kind === 'wop'
      ? await worktreeRisk($, removal.environment.worktree, serviceLogs(removal.environment))
      : await worktreeRisk($, removal.worktree.path, [])
  await update($, riskState, () => risk)
}

async function cancelRemoval($: Engine) {
  await update($, confirmingState, () => null)
}

async function tearDown($: Engine, environment: WopEnvironment) {
  $.ui.toast('Tearing down ' + environment.branch + '…')
  if (environment.current) await $.command.run({ command: 'cd', args: environment.project })
  await runWop($, environment, 'down')
  await saveAttached($, (await read($, attachedState)).filter((worktree) => worktree !== environment.worktree))
  $.ui.toast(environment.branch + ' torn down')
}

async function removeWorktree($: Engine, worktree: WopPlainWorktree, main: string) {
  $.ui.toast('Removing ' + worktree.branch + '…')
  if (worktree.current) await $.command.run({ command: 'cd', args: main })
  const result = await $.process.run(['git', 'worktree', 'remove', '--force', worktree.path], { cwd: main })
  if (result.exitCode !== 0) return $.ui.toast('Could not remove ' + worktree.branch + ': ' + result.stderr.trim().split('\n')[0])
  if (worktree.branch.startsWith('worktree-')) await $.process.run(['git', 'branch', '-D', worktree.branch], { cwd: main })
  $.ui.toast(worktree.branch + ' removed')
}

async function confirmRemoval($: Engine) {
  const removal = removalFor(await readView($), await read($, confirmingState))
  await update($, confirmingState, () => null)
  if (removal?.kind === 'wop') await tearDown($, removal.environment)
  if (removal?.kind === 'plain') await removeWorktree($, removal.worktree, removal.main)
  await reloadPicker($)
}

async function untrack($: Engine) {
  const view = await readView($)
  const environment = view.wop.find((candidate) => candidate.worktree === view.focused)
  if (!environment?.attached || environment.current) return
  await saveAttached($, (await read($, attachedState)).filter((worktree) => worktree !== environment.worktree))
  await refresh($)
  $.ui.toast('/exit will no longer ask about ' + environment.branch)
}

function statusText(environment: WopEnvironment) {
  const status = health(environment.services)
  if (environment.missing) return { color: 'error', note: '⚠ folder missing' } as const
  if (status.running === environment.services.length) return { color: 'success', note: null } as const
  if (status.running === 0) return { color: 'error', note: 'stopped' } as const
  return { color: 'warning', note: status.label } as const
}

function details(environment: WopEnvironment) {
  return [
    '◆ ' + (environment.database ?? 'no database found'),
    ...(environment.attached && !environment.current ? ['tracked by this chat'] : []),
    ...(environment.otherChats > 0 ? [plural(environment.otherChats, 'other chat') + ' here'] : []),
  ].join(' · ')
}

function hereTag(ui: Ui, current: boolean) {
  const { Text } = ui
  return current ? <Text color="magenta" bold wrap="truncate-end">◀ here</Text> : null
}

function sectionTitle(ui: Ui, glyph: string, title: string, first: boolean) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" columnGap={1} marginTop={first ? 0 : 1} marginBottom={1}>
      <Text color="magenta" bold>{glyph}</Text>
      <Text bold>{title}</Text>
    </Box>
  )
}

function rowButton(ui: Ui, key: string, label: string, current: boolean, onPress: () => void) {
  const { Button } = ui
  return current ? (
    <Button key={key} label={fit(label, label.length)} plain autoFocus onPress={onPress} />
  ) : (
    <Button key={key} label={fit(label, label.length)} plain onPress={onPress} />
  )
}

function portsLine(ui: Ui, environment: WopEnvironment) {
  const { Box, Text } = ui
  const ordered = [...environment.services].sort((left, right) => (left.name === 'web' ? -1 : right.name === 'web' ? 1 : 0))
  return (
    <Box flexDirection="row" columnGap={2} paddingLeft={2}>
      {ordered.flatMap((service, index) => {
        const color = service.running ? serviceColor(service) : null
        const label = service.name + ' :' + service.port
        return [
          ...(index > 0 ? [<Text dimColor>·</Text>] : []),
          color ? <Text color={color}>{label}</Text> : <Text dimColor>{label}</Text>,
        ]
      })}
    </Box>
  )
}

function wopRow($: Engine, ui: Ui, view: View, environment: WopEnvironment) {
  const { Box, Text } = ui
  const key = environment.worktree
  const status = statusText(environment)
  const isFocused = view.focused === key
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isFocused || environment.current ? 'magenta' : 'inactive'}
      borderDimColor={environment.current && !isFocused}
      paddingX={1}
    >
      <Box flexDirection="row" columnGap={1}>
        <Text color={status.color}>●</Text>
        {rowButton(ui, key, environment.branch, environment.current, () => moveTo($, key, environment))}
        {status.note ? <Text color={status.color}>{status.note}</Text> : null}
        <Box flexGrow={1} />
        {hereTag(ui, environment.current)}
      </Box>
      {portsLine(ui, environment)}
      {isFocused ? (
        <Box paddingLeft={2}>
          <Text dimColor wrap="truncate-middle">{details(environment)}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

function plainRow(ui: Ui, view: View, row: PlainRow) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" columnGap={1}>
      <Text color="magenta" bold>{view.focused === row.key ? '❯ ' : '  '}</Text>
      {row.current ? <Text color="magenta">{row.icon}</Text> : <Text dimColor>{row.icon}</Text>}
      {rowButton(ui, row.key, row.label, row.current, row.onPress)}
      {hereTag(ui, row.current)}
    </Box>
  )
}

function riskLine(ui: Ui, view: View, removal: Removal) {
  const { Text } = ui
  if (!view.risk) return <Text dimColor>Checking for unsaved work…</Text>
  const found = warnings(view.risk, removal.kind === 'wop' ? removal.environment.otherChats : 0)
  if (found.length === 0) return <Text color="success">✓ No uncommitted changes or unpushed commits</Text>
  return <Text color="warning" bold wrap="wrap">{'⚠ ' + found.join(' · ')}</Text>
}

function confirmBar($: Engine, ui: Ui, view: View, removal: Removal) {
  const { Box, Text, Button } = ui
  const text = removalText(removal)
  return (
    <Box key="confirm" flexDirection="column" borderStyle="round" borderColor="error" paddingX={1}>
      <Text color="red" bold>{text.title}</Text>
      {riskLine(ui, view, removal)}
      <Text dimColor wrap="wrap">{text.detail}</Text>
      <Box flexDirection="row" columnGap={3}>
        <Button key="confirm-yes" label={text.confirmLabel} hotkey="y" plain onPress={() => confirmRemoval($)} />
        <Button key="confirm-no" label="cancel" hotkey="n" plain onPress={() => cancelRemoval($)} />
      </Box>
    </Box>
  )
}

function footer($: Engine, ui: Ui, view: View) {
  const { Box, Text, Button } = ui
  const focusedEnvironment = view.wop.find((environment) => environment.worktree === view.focused)
  const canUntrack = focusedEnvironment?.attached === true && !focusedEnvironment.current
  return (
    <Box flexDirection="row" columnGap={2} marginTop={1}>
      <Text dimColor>↑↓ move</Text>
      <Text dimColor>·</Text>
      <Text dimColor>⏎ open</Text>
      <Text dimColor>·</Text>
      <Button key="remove" label="remove" plain dimColor hotkey="x" onPress={() => requestRemoval($)} />
      {canUntrack ? <Text dimColor>·</Text> : null}
      {canUntrack ? <Button key="untrack" label="untrack" plain dimColor hotkey="u" onPress={() => untrack($)} /> : null}
      <Text dimColor>·</Text>
      <Text dimColor>esc close</Text>
      <Button key="close-picker" label="" plain action={CYCLE_ACTION} onPress={() => closePicker($)} />
    </Box>
  )
}

function pickerTree($: Engine, ui: Ui, view: View) {
  const { Box, Text } = ui
  if (!view.picker) return <Text dimColor>Reading worktrees…</Text>
  const main = view.picker.main
  if (!main) return <Text color="error">This chat is not inside a git repository.</Text>

  const removal = removalFor(view, view.confirming)
  const confirmUnder = (key: string) => (removal?.key === key ? [confirmBar($, ui, view, removal)] : [])
  const plainRows: PlainRow[] = [
    { key: 'main', icon: '⌂', label: 'main checkout', current: main.current, onPress: () => moveTo($, main.path, null) },
    ...view.picker.plain.map((worktree) => ({
      key: worktree.path,
      icon: '⑂',
      label: worktree.branch,
      current: worktree.current,
      onPress: () => moveTo($, worktree.path, null),
    })),
  ]

  return (
    <Box flexDirection="column" paddingRight={1}>
      {view.wop.length > 0 ? sectionTitle(ui, '⎇', 'wop environments', true) : null}
      {view.wop.flatMap((environment) => [wopRow($, ui, view, environment), ...confirmUnder(environment.worktree)])}
      {sectionTitle(ui, '⑂', 'git worktrees', view.wop.length === 0)}
      {plainRows.flatMap((row) => [plainRow(ui, view, row), ...confirmUnder(row.key)])}
      {removal ? null : footer($, ui, view)}
    </Box>
  )
}

const KEEP = 'Keep running'
const STOP = 'Stop services'
const DOWN = 'Tear down'
const REFRESH_MS = 3000

function footerItems($: Engine, ui: Ui, environments: WopEnvironment[]) {
  const { Text, Button } = ui
  const current = environments.find((environment) => environment.current)
  const web = current ? webService(current) : undefined
  const status = current ? health(current.services) : null
  const webColor = web ? serviceColor(web) : null
  return [
    <Text color="magenta" bold>⎇ </Text>,
    ...(current && status && web
      ? [
          <Text color={status.color}>{status.dot}</Text>,
          <Text bold>{current.branch.slice(current.branch.indexOf('/') + 1)}</Text>,
          webColor ? <Text color={webColor}>{':' + web.port}</Text> : <Text>{':' + web.port}</Text>,
          <Text dimColor>·</Text>,
        ]
      : []),
    <Button
      key="view-all-worktrees"
      label={'View all worktrees (' + environments.length + ')'}
      plain
      action={CYCLE_ACTION}
      onPress={() => togglePicker($)}
    />,
    <Text dimColor>⌃Q</Text>,
  ]
}

async function askOnExit($: Engine, environment: WopEnvironment) {
  const risk = await worktreeRisk($, environment.worktree, serviceLogs(environment))
  const question = exitQuestion(environment, warnings(risk, environment.otherChats))
  return $.ui.ask(question, { header: 'wop', options: [KEEP, STOP, DOWN] })
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({ name: 'worktrees', description: 'Pick a wop environment or git worktree to move this chat into' })
    } catch {}
    await restoreAttached($)
    await prune($).catch(() => {})
    await refresh($)
    $.clock.every(REFRESH_MS, () => refresh($))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await attachFromToolCall($, e).catch(() => {})
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const modes = await next(e)
    const environments = (await read($, environmentsState)).filter((environment) => environment.inProject || environment.current)
    if (environments.length === 0) return modes
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    return (
      <Box flexDirection="row" columnGap={1}>
        {footerItems($, ui, environments)}
        {modes && e.props.modes.length > 0 ? <Text dimColor>·</Text> : null}
        {modes && e.props.modes.length > 0 ? modes : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => pickerTree($, $.ui.resolve(e), await readView($)))

  on('ui.focus', async ($, e, next) => {
    if (e.requestId !== PICKER) return next(e)
    const result = await next(e)
    await update($, focusedState, () => e.element ?? null)
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'worktrees' }, async ($) => {
    await openPicker($)
    return {}
  })

  on('command.run', { command: 'exit' }, async ($, e, next) => {
    await refresh($)
    const environments = await read($, environmentsState)
    for (const environment of environments.filter((candidate) => (candidate.attached || candidate.current) && !candidate.claudeWorktree)) {
      let answer: string
      try {
        answer = await askOnExit($, environment)
      } catch {
        return { text: 'Exit cancelled.' }
      }
      if (answer === STOP) await runWop($, environment, 'stop')
      if (answer === DOWN) await runWop($, environment, 'down')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await endChat($).catch(() => {})
    const exiting = e.reason === 'prompt_input_exit' || e.reason === 'other'
    const registered = new Set(worktreesIn(exiting ? ((await readEntries($)) ?? []) : []))
    for (const environment of await read($, environmentsState)) {
      if (environment.claudeWorktree && registered.has(environment.worktree)) await runWop($, environment, 'stop')
    }
    return next(e)
  })
}
