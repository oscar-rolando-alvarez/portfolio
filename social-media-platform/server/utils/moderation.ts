// Content moderation port with three adapters, selected by NUXT_MODERATION_PROVIDER:
//   none     - accept everything
//   keyword  - local deny-list (default; no network, deterministic)
//   llm      - any OpenAI-compatible chat completions endpoint (hosted, LiteLLM proxy, Ollama, vLLM...)
// The LLM adapter fails open (falls back to the keyword check) so posting never depends on an external API.

export interface ModerationResult {
  flagged: boolean
  reason?: string
}

export interface ModerationProvider {
  readonly name: string
  check(text: string): Promise<ModerationResult>
}

const DEFAULT_BLOCKLIST = ['buy followers', 'free crypto', 'click here to win', 'wire me money']

export function createKeywordModerator(blocklist: readonly string[] = DEFAULT_BLOCKLIST): ModerationProvider {
  const terms = blocklist.map(term => term.toLowerCase())
  return {
    name: 'keyword',
    async check(text) {
      const lower = text.toLowerCase()
      const hit = terms.find(term => lower.includes(term))
      return hit ? { flagged: true, reason: `blocked phrase: ${hit}` } : { flagged: false }
    }
  }
}

export interface LlmModeratorOptions {
  baseUrl: string
  apiKey?: string
  model: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  fallback?: ModerationProvider
}

const SYSTEM_PROMPT = 'You are a content moderation classifier for a social network. '
  + 'Flag spam, scams, harassment, hate speech, sexual content involving minors and threats of violence. '
  + 'Reply with JSON only: {"flagged": boolean, "reason": string}.'

export function createLlmModerator(options: LlmModeratorOptions): ModerationProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const fallback = options.fallback ?? createKeywordModerator()
  return {
    name: 'llm',
    async check(text) {
      try {
        const res = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: text }
            ]
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 5000)
        })
        if (!res.ok) throw new Error(`moderation endpoint returned ${res.status}`)
        const body = await res.json() as { choices?: { message?: { content?: string } }[] }
        const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '{}') as Partial<ModerationResult>
        if (typeof parsed.flagged !== 'boolean') throw new Error('unexpected moderation payload')
        return { flagged: parsed.flagged, reason: parsed.reason }
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', msg: 'llm moderation failed, using fallback', error: String(error) }))
        return fallback.check(text)
      }
    }
  }
}

export function createModerator(config: { provider?: string, baseUrl?: string, apiKey?: string, model?: string }): ModerationProvider {
  switch (config.provider) {
    case 'none':
      return { name: 'none', check: async () => ({ flagged: false }) }
    case 'llm':
      if (!config.baseUrl || !config.model) {
        throw new Error('NUXT_MODERATION_BASE_URL and NUXT_MODERATION_MODEL are required for the llm provider')
      }
      return createLlmModerator({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model })
    default:
      return createKeywordModerator()
  }
}
