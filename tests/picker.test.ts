import { describe, expect, test } from 'claude-code/testing'

import { EXIT, LOGIN, MAIN, NOW, PICKER, SEARCH, SESSION_START, SPIKE, WORKTREES, fake, otherChat, ran } from './fake'

const PANE = {
  plugin: 'wop-worktrees',
  component: 'Pane',
  requestId: PICKER,
  props: { title: 'wop worktrees', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

describe('the worktree list', () => {
  test('draws every wop environment and git worktree on terminal and desktop', async ($, on) => {
    fake(on, { cwd: LOGIN })
    await $.session.start({ ...SESSION_START, cwd: LOGIN })
    await $.command.run(WORKTREES)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ key: LOGIN })).toBeDefined()
      expect(await ui.find({ key: SEARCH })).toBeDefined()
      expect(await ui.find({ key: SPIKE })).toBeDefined()
      expect(await ui.find({ key: 'main' })).toBeDefined()
      expect(await ui.find({ text: 'web :4001' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('counts environments whose registry path goes through a symlink as this repo', async ($, on) => {
    fake(on, { project: '/link/app', links: { '/link/app': MAIN } })
    await $.session.start(SESSION_START)
    await $.command.run(WORKTREES)

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ text: 'web :4001' })).toBeDefined()
    expect(await ui.find({ text: 'web :4011' })).toBeDefined()
  })

  test('warns that another chat is working in an environment before tearing it down', async ($, on) => {
    const world = fake(on)
    otherChat(world, 'chat-2', { cwd: SEARCH, attached: [] })
    await $.session.start(SESSION_START)
    await $.command.run(WORKTREES)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    await $.ui.focus({ component: 'Pane', requestId: PICKER, element: SEARCH, origin: { kind: 'person' } })
    await ui.press({ key: 'remove' })

    expect(await ui.find({ text: /another chat is working in it/ })).toBeDefined()
    await ui.press({ key: 'confirm-yes' })
    expect(ran(world, 'wop', 'down', 'feature/search')).toBe(true)
  })

  test('removing a throwaway worktree also deletes its branch', async ($, on) => {
    const world = fake(on)
    await $.session.start(SESSION_START)
    await $.command.run(WORKTREES)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    await $.ui.focus({ component: 'Pane', requestId: PICKER, element: SPIKE, origin: { kind: 'person' } })
    await ui.press({ key: 'remove' })
    await ui.press({ key: 'confirm-yes' })

    expect(ran(world, 'git', 'worktree', 'remove', '--force', SPIKE)).toBe(true)
    expect(ran(world, 'git', 'branch', '-D', 'worktree-spike')).toBe(true)
  })

  test('untracking an environment stops /exit from asking about it', async ($, on) => {
    const world = fake(on, { store: { 'attached:chat-1': { worktrees: [SEARCH], at: NOW } } })
    await $.session.start(SESSION_START)
    await $.command.run(WORKTREES)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    await $.ui.focus({ component: 'Pane', requestId: PICKER, element: SEARCH, origin: { kind: 'person' } })
    await ui.press({ key: 'untrack' })
    await $.command.run(EXIT)

    expect(world.questions).toHaveLength(0)
  })
})
