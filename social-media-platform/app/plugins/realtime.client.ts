import type { RealtimeEvent } from '#shared/types'

/**
 * Opens the /_ws WebSocket while a user is signed in and routes events into the inbox store.
 * Reconnects with capped exponential backoff.
 */
export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const inbox = useInboxStore()

  let socket: WebSocket | null = null
  let retry = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${protocol}://${location.host}/_ws`)
    socket.onopen = () => {
      retry = 0
    }
    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string) as RealtimeEvent | { type: 'ready' }
        if (data.type !== 'ready') inbox.handleRealtime(data)
      } catch {
        // ignore non-JSON frames (e.g. pong)
      }
    }
    socket.onclose = (event) => {
      socket = null
      if (!auth.isAuthenticated || event.code === 4401) return
      timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++))
    }
  }

  function disconnect() {
    clearTimeout(timer)
    socket?.close()
    socket = null
  }

  watch(() => auth.isAuthenticated, (signedIn) => {
    if (signedIn && !socket) connect()
    else if (!signedIn) disconnect()
  }, { immediate: true })
})
