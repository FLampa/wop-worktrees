import { describe, expect, mock, test } from 'claude-code/testing'

import { LOGIN, MAIN, SESSION_START, fake } from './fake'

function wopBlock(result: { blocks: readonly { name: string; text: string }[] }) {
  return result.blocks.find((block) => block.name === 'wopEnvironment')
}

function appendedText(rows: readonly { message: { content: unknown } }[]) {
  return rows.map((row) => JSON.stringify(row.message.content)).join('\n')
}

describe("Claude knows the chat's environment", () => {
  test('the opening context names its ports and database', async ($, on) => {
    fake(on, { cwd: LOGIN })
    await $.session.start({ ...SESSION_START, cwd: LOGIN })

    const block = wopBlock(await $.prompt.context({ blocks: [] }))

    expect(block?.text).toContain('web on port 4001, css on port 4002')
    expect(block?.text).toContain('http://localhost:4001')
    expect(block?.text).toContain('app_login_ab12')
  })

  test('adds nothing outside a wop environment', async ($, on) => {
    fake(on, { cwd: MAIN })
    await $.session.start(SESSION_START)

    expect(wopBlock(await $.prompt.context({ blocks: [] }))).toBeUndefined()
  })

  test('a note tells Claude when the chat moves into an environment and out again', async ($, on) => {
    const session = mock.session(on)
    const world = fake(on, { cwd: MAIN })
    await $.session.start(SESSION_START)
    expect(session.appended()).toHaveLength(0)

    world.cwd = LOGIN
    await world.advance(3000)
    expect(appendedText(session.appended())).toContain('branch feature/login')

    world.cwd = MAIN
    await world.advance(3000)
    expect(appendedText(session.appended())).toContain('no longer in a wop environment')
  })
})
