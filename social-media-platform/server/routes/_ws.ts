// Real-time channel: browsers connect to /_ws after login and receive RealtimeEvent JSON
// frames (new direct messages, notifications). Authentication reuses the access cookie.

function readCookie(header: string | null | undefined, name: string): string | undefined {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export default defineWebSocketHandler({
  async open(peer) {
    const token = readCookie(peer.request?.headers.get('cookie'), ACCESS_COOKIE)
    const claims = token ? await verifyAccessToken(token, authSecret()) : null
    if (!claims) {
      peer.close(4401, 'unauthorized')
      return
    }
    peer.context.userId = claims.userId
    registerPeer(claims.userId, peer)
    peer.send(JSON.stringify({ type: 'ready' }))
  },
  close(peer) {
    const userId = peer.context.userId as string | undefined
    if (userId) unregisterPeer(userId, peer)
  },
  message(peer, message) {
    if (message.text() === 'ping') peer.send('pong')
  }
})
