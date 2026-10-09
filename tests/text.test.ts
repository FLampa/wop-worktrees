import { describe, expect, test } from 'claude-code/testing'

import { matchesToolCall, parseGitWorktrees, warnings } from '../hooks/text'

const entry = {
  project_path: '/code/app',
  branch: 'feature/login',
  worktree_path: '/code/app--feature-login_ab12',
  service: 'web',
  port: 4001,
}

describe('text helpers', () => {
  test('a tool call matches an environment by folder name or by wop up of its branch', async () => {
    expect(matchesToolCall('{"command":"ls ../app--feature-login_ab12/app"}', entry)).toBe(true)
    expect(matchesToolCall('{"command":"wop up feature/login"}', entry)).toBe(true)
    expect(matchesToolCall('{"command":"ls ../app--feature-login_ab12-old"}', entry)).toBe(false)
    expect(matchesToolCall('{"command":"git log feature/login"}', entry)).toBe(false)
  })

  test('parses git worktree list output, detached heads included', async () => {
    const parsed = parseGitWorktrees('worktree /a\nHEAD 1\nbranch refs/heads/main\n\nworktree /b\nHEAD 2\ndetached\n')
    expect(parsed).toEqual([
      { path: '/a', branch: 'main' },
      { path: '/b', branch: 'detached HEAD' },
    ])
  })

  test('lists other chats before unsaved work', async () => {
    expect(warnings({ changes: 1, unpushed: 3, failed: false }, 2)).toEqual([
      '2 other chats are working in it',
      '1 uncommitted change',
      '3 commits not on the remote',
    ])
    expect(warnings({ changes: 0, unpushed: 0, failed: false }, 0)).toEqual([])
  })
})
