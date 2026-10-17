import type { ModerationProvider } from './moderation'
import { createModerator } from './moderation'

let moderator: ModerationProvider | undefined

export function useModerator(): ModerationProvider {
  moderator ??= createModerator(useRuntimeConfig().moderation)
  return moderator
}
