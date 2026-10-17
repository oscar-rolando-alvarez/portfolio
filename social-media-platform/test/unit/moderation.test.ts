import { describe, expect, it, vi } from 'vitest'
import { createKeywordModerator, createLlmModerator, createModerator } from '../../server/utils/moderation'

const completion = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } })

describe('keyword moderator', () => {
  it('flags blocklisted phrases case-insensitively', async () => {
    const mod = createKeywordModerator()
    await expect(mod.check('Want to BUY FOLLOWERS cheap?')).resolves.toMatchObject({ flagged: true })
    await expect(mod.check('Lovely sunset today')).resolves.toEqual({ flagged: false })
  })

  it('accepts a custom blocklist', async () => {
    const mod = createKeywordModerator(['forbidden'])
    await expect(mod.check('this is Forbidden')).resolves.toMatchObject({ flagged: true })
  })
})

describe('LLM moderator (OpenAI-compatible)', () => {
  it('sends a JSON-mode chat completion and parses the verdict', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(completion('{"flagged":true,"reason":"scam"}'))
    const mod = createLlmModerator({ baseUrl: 'http://llm.local/v1/', apiKey: 'test-key', model: 'any-model', fetchImpl })

    await expect(mod.check('send me your bank details')).resolves.toEqual({ flagged: true, reason: 'scam' })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://llm.local/v1/chat/completions')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer test-key')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'any-model', temperature: 0, response_format: { type: 'json_object' } })
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'send me your bank details' })
  })

  it('omits the auth header when no key is configured (e.g. local Ollama)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(completion('{"flagged":false}'))
    const mod = createLlmModerator({ baseUrl: 'http://localhost:11434/v1', model: 'local', fetchImpl })
    await mod.check('hello')
    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('fails open to the fallback when the endpoint errors or returns garbage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fallback = { name: 'fake', check: vi.fn().mockResolvedValue({ flagged: false }) }

    const down = createLlmModerator({ baseUrl: 'http://x', model: 'm', fallback, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 500 })) })
    await expect(down.check('hi')).resolves.toEqual({ flagged: false })

    const garbage = createLlmModerator({ baseUrl: 'http://x', model: 'm', fallback, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(completion('not json')) })
    await expect(garbage.check('hi')).resolves.toEqual({ flagged: false })

    expect(fallback.check).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})

describe('createModerator', () => {
  it('selects adapters from config', async () => {
    expect(createModerator({ provider: 'none' }).name).toBe('none')
    expect(createModerator({}).name).toBe('keyword')
    expect(createModerator({ provider: 'llm', baseUrl: 'http://x', model: 'm' }).name).toBe('llm')
    expect(() => createModerator({ provider: 'llm' })).toThrow(/required/)
    await expect(createModerator({ provider: 'none' }).check('buy followers')).resolves.toEqual({ flagged: false })
  })
})
