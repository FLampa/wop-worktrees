import { describe, expect, test } from 'claude-code/testing'

import { HOME, LOGIN, MAIN, SEARCH, SESSION_START, TURN, fake, wopUp } from './fake'
import type { Fake } from './fake'

const REGISTRY = HOME + '/.config/devmanager/registry.json'

function cds(world: Fake) {
  return world.commands.filter((command) => command.startsWith('cd'))
}

function unregister(world: Fake, worktree: string) {
  const file = world.files.get(REGISTRY)
  const registry = JSON.parse(file?.text ?? '{}')
  const entries = registry.entries.filter((entry: { worktree_path: string }) => entry.worktree_path !== worktree)
  world.files.set(REGISTRY, { text: JSON.stringify({ entries }), mtimeMs: file?.mtimeMs ?? 0 })
  return () => world.files.set(REGISTRY, file ?? { text: '', mtimeMs: 0 })
}

describe('offering to move after wop up', () => {
  test('asks when the turn ends, and Move takes the chat there', async ($, on) => {
    const world = fake(on, { cwd: MAIN, answer: 'Move' })
    await $.session.start(SESSION_START)

    await $.tool.call(wopUp('feature/search'))
    expect(world.questions).toHaveLength(0)

    await $.turn.complete(TURN)
    await world.advance(300)

    expect(world.questions).toEqual(['Move this chat to feature/search?'])
    expect(cds(world)).toEqual(['cd ' + SEARCH])
  })

  test('asks once the environment registers after the turn that ran wop up', async ($, on) => {
    const world = fake(on, { cwd: MAIN, answer: 'Move' })
    const register = unregister(world, SEARCH)
    await $.session.start(SESSION_START)

    await $.tool.call(wopUp('feature/search'))
    await $.turn.complete(TURN)
    await world.advance(300)
    expect(world.questions).toHaveLength(0)

    register()
    await world.advance(3000)
    await $.turn.complete(TURN)
    await world.advance(300)

    expect(world.questions).toEqual(['Move this chat to feature/search?'])
    expect(cds(world)).toEqual(['cd ' + SEARCH])
  })

  test('Stay keeps the chat put and does not ask again', async ($, on) => {
    const world = fake(on, { cwd: MAIN, answer: 'Stay' })
    await $.session.start(SESSION_START)

    await $.tool.call(wopUp('feature/search'))
    await $.turn.complete(TURN)
    await world.advance(300)
    await $.tool.call(wopUp('feature/search'))
    await $.turn.complete(TURN)
    await world.advance(300)

    expect(world.questions).toHaveLength(1)
    expect(cds(world)).toEqual([])
  })

  test('asks nothing for an environment a command only names', async ($, on) => {
    const world = fake(on, { cwd: MAIN, answer: 'Move' })
    await $.session.start(SESSION_START)

    await $.tool.call({ tool: 'Bash', command: 'ls ' + SEARCH, description: 'List the worktree' })
    await $.turn.complete(TURN)
    await world.advance(300)

    expect(world.questions).toHaveLength(0)
  })

  test('asks nothing when the chat is already in that environment', async ($, on) => {
    const world = fake(on, { cwd: LOGIN, answer: 'Move' })
    await $.session.start({ ...SESSION_START, cwd: LOGIN })

    await $.tool.call(wopUp('feature/login'))
    await $.turn.complete(TURN)
    await world.advance(300)

    expect(world.questions).toHaveLength(0)
  })

  test('asks nothing at the end of a subagent turn', async ($, on) => {
    const world = fake(on, { cwd: MAIN, answer: 'Move' })
    await $.session.start(SESSION_START)

    await $.tool.call(wopUp('feature/search'))
    await $.turn.complete({ ...TURN, agentId: 'agent-1' })
    await world.advance(300)

    expect(world.questions).toHaveLength(0)
  })
})
