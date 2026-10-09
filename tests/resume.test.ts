import { describe, expect, test } from 'claude-code/testing'

import { LOGIN, MAIN, NOW, SESSION_START, fake } from './fake'

describe('resuming a chat', () => {
  test('moves the chat back to the worktree it was in when it closed', async ($, on) => {
    const world = fake(on, { cwd: MAIN, store: { 'cwd:chat-1': { cwd: LOGIN, at: NOW } } })
    await $.classic.SessionStart({ source: 'resume' })
    await $.session.start(SESSION_START)

    expect(world.commands).not.toContain('cd ' + LOGIN)
    await world.advance(300)

    expect(world.commands).toContain('cd ' + LOGIN)
  })

  test('stays put when that worktree is gone', async ($, on) => {
    const world = fake(on, { cwd: MAIN, store: { 'cwd:chat-1': { cwd: '/code/app--feature-gone_ee55', at: NOW } } })
    await $.classic.SessionStart({ source: 'resume' })
    await $.session.start(SESSION_START)
    await world.advance(300)

    expect(world.commands.filter((command) => command.startsWith('cd'))).toEqual([])
  })

  test('stays put for a new chat', async ($, on) => {
    const world = fake(on, { cwd: MAIN })
    await $.session.start(SESSION_START)
    await world.advance(300)

    expect(world.commands.filter((command) => command.startsWith('cd'))).toEqual([])
  })

  test('stays put when the mod reloads mid-chat', async ($, on) => {
    const world = fake(on, { cwd: MAIN, store: { 'cwd:chat-1': { cwd: LOGIN, at: NOW } } })
    await $.session.start(SESSION_START)
    await world.advance(300)

    expect(world.commands.filter((command) => command.startsWith('cd'))).toEqual([])
  })
})
