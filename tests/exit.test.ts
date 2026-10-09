import { describe, expect, test } from 'claude-code/testing'

import { EXIT, LOGIN, MAIN, SESSION_START, fake, otherChat, ran } from './fake'

describe('/exit', () => {
  test('tears down the environment the chat is in when asked to', async ($, on) => {
    const world = fake(on, { cwd: LOGIN, answer: 'Tear down' })
    await $.session.start({ ...SESSION_START, cwd: LOGIN })

    const result = await $.command.run(EXIT)

    expect(world.questions).toHaveLength(1)
    expect(world.questions[0]).toContain('feature/login')
    expect(world.questions[0]).toContain('app_login_ab12')
    expect(ran(world, 'wop', 'down', 'feature/login')).toBe(true)
    expect(result.text).toBe('ran exit')
  })

  test('warns about unsaved work and another chat before tearing down', async ($, on) => {
    const world = fake(on, { cwd: LOGIN, gitStatus: ' M app/models/user.rb\n?? web.log\n', unpushed: '2\n' })
    otherChat(world, 'chat-2', { cwd: LOGIN + '/app', attached: [] })
    await $.session.start({ ...SESSION_START, cwd: LOGIN })

    await $.command.run(EXIT)

    expect(world.questions[0]).toContain('another chat is working in it')
    expect(world.questions[0]).toContain('1 uncommitted change ·')
    expect(world.questions[0]).toContain('2 commits not on the remote')
    expect(ran(world, 'wop')).toBe(false)
  })

  test('Esc keeps the chat open and touches nothing', async ($, on) => {
    const world = fake(on, { cwd: LOGIN, answer: null })
    await $.session.start({ ...SESSION_START, cwd: LOGIN })

    const result = await $.command.run(EXIT)

    expect(result.text).toBe('Exit cancelled.')
    expect(ran(world, 'wop')).toBe(false)
  })

  test('asks nothing when the chat never used an environment', async ($, on) => {
    const world = fake(on, { cwd: MAIN })
    await $.session.start(SESSION_START)

    const result = await $.command.run(EXIT)

    expect(world.questions).toHaveLength(0)
    expect(result.text).toBe('ran exit')
  })
})
