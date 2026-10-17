const SKIP_PREFIXES = ['/_nuxt/', '/api/health', '/api/_nuxt_icon']

// Populates event.context.auth for every request. Authorization is enforced per route
// with requireAuth(), so public routes (health, login, register) need no allow-list.
export default defineEventHandler(async (event) => {
  if (SKIP_PREFIXES.some(prefix => event.path.startsWith(prefix))) return

  const hasCredentials = getCookie(event, ACCESS_COOKIE) || getCookie(event, REFRESH_COOKIE) || getHeader(event, 'authorization')
  if (!hasCredentials) return

  const auth = await resolveAuth(event)
  if (auth) event.context.auth = auth
})
