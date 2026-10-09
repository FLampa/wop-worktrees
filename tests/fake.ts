import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const NOW = 1_800_000_000_000
export const HOME = '/home/dev'
export const MAIN = '/code/app'
export const LOGIN = '/code/app--feature-login_ab12'
export const SEARCH = '/code/app--feature-search_cd34'
export const SPIKE = '/code/app/.claude/worktrees/spike'
export const CHATS = HOME + '/.claude/wop-worktrees/chats'
export const PICKER = 'wop-worktrees'

export type Fake = {
  files: Map<string, { text: string; mtimeMs: number }>
  runs: string[][]
  questions: string[]
  answer: string | null
  cwd: string
  gitStatus: string
  unpushed: string
  commands: string[]
  links: Record<string, string>
  advance: (ms: number) => Promise<void>
}

const registry = {
  entries: [
    { project_path: MAIN, branch: 'feature/login', worktree_path: LOGIN, service: 'web', port: 4001, pid: 101, cmd: 'bin/rails server' },
    { project_path: MAIN, branch: 'feature/login', worktree_path: LOGIN, service: 'css', port: 4002, pid: 102, cmd: 'pnpm build:css --watch' },
    { project_path: MAIN, branch: 'feature/search', worktree_path: SEARCH, service: 'web', port: 4011, pid: 201, cmd: 'bin/rails server' },
  ],
}

const worktreeList = [
  'worktree ' + MAIN + '\nHEAD aaa\nbranch refs/heads/main',
  'worktree ' + LOGIN + '\nHEAD bbb\nbranch refs/heads/feature/login',
  'worktree ' + SEARCH + '\nHEAD ccc\nbranch refs/heads/feature/search',
  'worktree ' + SPIKE + '\nHEAD ddd\nbranch refs/heads/worktree-spike',
].join('\n\n')

function stdout(fake: Fake, argv: readonly string[]) {
  const command = argv.slice(0, 2).join(' ')
  if (command === 'sh -c') return (fake.links[argv[4] ?? ''] ?? argv[4]) + '\n'
  if (argv[0] === 'ps') return '101\n102\n201\n'
  if (command === 'git rev-parse') return MAIN + '/.git\n'
  if (command === 'git status') return fake.gitStatus
  if (command === 'git rev-list') return fake.unpushed
  if (command === 'git worktree' && argv[2] === 'list') return worktreeList
  return ''
}

export function otherChat(fake: Fake, id: string, chat: { cwd: string; attached: string[] }) {
  fake.files.set(CHATS + '/' + id + '.json', { text: JSON.stringify(chat), mtimeMs: NOW })
}

export function fake(
  on: On,
  start: Partial<Fake> & { store?: Record<string, unknown>; env?: Record<string, string>; project?: string } = {},
): Fake {
  const project = start.project ?? MAIN
  const entries = registry.entries.map((entry) => ({ ...entry, project_path: project }))
  const world: Fake = {
    files: new Map([
      [HOME + '/.config/devmanager/registry.json', { text: JSON.stringify({ entries }), mtimeMs: NOW }],
      [LOGIN + '/.env', { text: 'DATABASE_URL=postgresql://localhost/app_login_ab12\n', mtimeMs: NOW }],
      [SEARCH + '/.env', { text: 'DATABASE_URL=postgresql://localhost/app_search_cd34\n', mtimeMs: NOW }],
      [SPIKE + '/README.md', { text: '', mtimeMs: NOW }],
    ]),
    runs: [],
    questions: [],
    answer: 'Keep running',
    cwd: MAIN,
    gitStatus: '',
    unpushed: '0\n',
    commands: [],
    links: {},
    advance: async () => {},
    ...start,
  }

  mock.env(on, { HOME, ...start.env })
  mock.store(on, start.store ?? {})
  const clock = mock.clock(on, { now: NOW })
  world.advance = (ms) => clock.advance(ms)

  on('session.id', async () => ({ value: 'chat-1' }))
  on('session.cwd', async () => ({ value: world.cwd }))
  on('session.start', async () => ({ cwd: world.cwd }))
  on('classic.SessionStart', async () => ({}))
  on('prompt.context', async ($, e) => ({ blocks: e.blocks }))
  on('session.end', async () => ({ sessionId: 'chat-1' }))

  on('fs.read', async ($, e) => {
    const file = world.files.get(e.path)
    if (!file) throw new Error('ENOENT ' + e.path)
    return { value: file.text }
  })
  on('fs.exists', async ($, e) => ({ value: [...world.files.keys()].some((path) => path === e.path || path.startsWith(e.path + '/')) }))
  on('fs.write', async ($, e) => {
    world.files.set(e.path, { text: e.text, mtimeMs: NOW })
    return { value: undefined }
  })
  on('fs.list', async ($, e) => {
    const inside = [...world.files.entries()].filter(([path]) => path.slice(0, path.lastIndexOf('/')) === e.path)
    if (inside.length === 0) throw new Error('ENOENT ' + e.path)
    return {
      value: inside.map(([path, file]) => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: file.text.length, mtimeMs: file.mtimeMs, isLink: false })),
    }
  })

  on('process.run', async ($, e) => {
    world.runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: stdout(world, e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e) => {
    const question = e.questions[0]?.question ?? ''
    world.questions.push(question)
    if (world.answer === null) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [question]: world.answer } } }
  })

  on('tool.call', { tool: 'Bash' }, async () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))

  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('command.run', async ($, e) => {
    world.commands.push((e.command + ' ' + e.args).trim())
    return { text: 'ran ' + e.command }
  })
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('ui.close', async () => ({ value: undefined }))
  on('ui.focus', async () => ({}))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.toast', async () => ({ value: undefined }))

  return world
}

export const SESSION_START = { cwd: MAIN, surface: 'terminal', isInteractive: true } as const
export const EXIT = { command: 'exit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const
export const WORKTREES = { ...EXIT, command: 'worktrees' } as const

export function ran(world: Fake, ...argv: string[]) {
  return world.runs.some((run) => argv.every((part, index) => run[index] === part))
}

export const TURN = { answer: 'Done.', durationMs: 1000, isAborted: false, turnId: 'turn-1', reason: 'answer' } as const

export function wopUp(branch: string) {
  return { tool: 'Bash', command: 'wop up ' + branch, description: 'Bring up ' + branch } as const
}

export const EXIT_FILE = '/tmp/wop-worktrees-exit.test'
export const LEFT = { reason: 'prompt_input_exit', sessionId: 'chat-1', resume: { id: 'chat-1' } } as const
