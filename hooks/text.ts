import type { WopEnvironment, WopPlainWorktree, WopRisk, WopService } from '../types'

export type RegistryEntry = {
  project_path: string
  branch: string
  worktree_path: string
  service: string
  port: number
  pid?: number
  cmd?: string
}

export const WOP_COMMAND = /\bwop\s+(?:up|restart)\b/
const WOP_BRANCH_COMMAND = /\bwop\s+(?:up|restart)\s+\\?["']?([\w./-]+)/g

const SERVICE_COLORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\brails\b|\bpuma\b/, '#CC342D'],
  [/\bvite\b|pnpm dev|npm run dev|yarn dev/, '#646CFF'],
  [/tailwind|\bcss\b/, '#2965F1'],
  [/esbuild|webpack|\bnode\b/, '#F7DF1E'],
]

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const insideWorktree = (path: string, worktree: string) => path === worktree || path.startsWith(worktree + '/')

export function mentions(text: string, worktree: string) {
  return new RegExp(escapeRegExp(basename(worktree)) + '(?![\\w-])').test(text)
}

export function branchesIn(text: string) {
  return new Set([...text.matchAll(WOP_BRANCH_COMMAND)].map((match) => match[1]))
}

export function matchesToolCall(text: string, entry: RegistryEntry) {
  return mentions(text, entry.worktree_path) || branchesIn(text).has(entry.branch)
}

export function worktreesIn(entries: readonly RegistryEntry[]) {
  return [...new Set(entries.map((entry) => entry.worktree_path))]
}

export function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function parseGitWorktrees(porcelain: string): Omit<WopPlainWorktree, 'current'>[] {
  return porcelain
    .trim()
    .split('\n\n')
    .map((block) => {
      const field = (name: string) => block.match(new RegExp('^' + name + ' (.+)$', 'm'))?.[1]
      return { path: field('worktree') ?? '', branch: field('branch')?.replace('refs/heads/', '') ?? 'detached HEAD' }
    })
    .filter((worktree) => worktree.path !== '')
}

export function health(services: readonly WopService[]) {
  const running = services.filter((service) => service.running).length
  const color = running === services.length ? 'success' : running === 0 ? 'error' : 'warning'
  return { running, color, dot: running === 0 ? '○' : '●', label: running + '/' + services.length + ' running' } as const
}

export function serviceColor(service: WopService) {
  return SERVICE_COLORS.find(([pattern]) => pattern.test(service.cmd))?.[1] ?? null
}

export function webService(environment: WopEnvironment) {
  return environment.services.find((service) => service.name === 'web') ?? environment.services[0]
}

export function plural(count: number, word: string) {
  return count + ' ' + word + (count === 1 ? '' : 's')
}

export function fit(text: string, width: number) {
  const room = Math.max(width, 8)
  return text.length > room ? text.slice(0, room - 1) + '…' : text.padEnd(room)
}

export function warnings(risk: WopRisk | null, otherChats: number) {
  const found: string[] = []
  if (otherChats > 0) found.push(otherChats === 1 ? 'another chat is working in it' : otherChats + ' other chats are working in it')
  if (risk?.failed) found.push('could not check it for unsaved work')
  if (risk && risk.changes > 0) found.push(plural(risk.changes, 'uncommitted change'))
  if (risk && risk.unpushed > 0) found.push(plural(risk.unpushed, 'commit') + ' not on the remote')
  return found
}

export function exitQuestion(environment: WopEnvironment, found: readonly string[]) {
  const ports = environment.services.map((service) => service.name + ' :' + service.port).join(', ')
  const warning = found.length > 0 ? ' ⚠ ' + found.join(' · ') + '.' : ''
  return (
    environment.branch + ' still has its worktree, database ' + (environment.database ?? '(unknown)') +
    ' and ports (' + ports + ').' + warning + ' What should happen to it before you exit?'
  )
}
