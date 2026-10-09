export type WopService = { name: string; port: number; cmd: string; running: boolean }

export type WopEnvironment = {
  worktree: string
  branch: string
  project: string
  database: string | null
  missing: boolean
  claudeWorktree: boolean
  current: boolean
  attached: boolean
  inProject: boolean
  otherChats: number
  services: WopService[]
}

export type WopPlainWorktree = { path: string; branch: string; current: boolean }

export type WopPicker = {
  main: { path: string; current: boolean } | null
  plain: WopPlainWorktree[]
}

export type WopRisk = { changes: number; unpushed: number; failed: boolean }

export type WopMention = { text: string; until: number }

declare module 'claude-code' {
  interface PluginState {
    'wop-worktrees': {
      environments: WopEnvironment[]
      attached: string[]
      pending: WopMention[]
      picker: WopPicker | null
      focused: string | null
      confirming: string | null
      risk: WopRisk | null
    }
  }
}
