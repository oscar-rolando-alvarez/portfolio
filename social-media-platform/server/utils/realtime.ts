import type { Peer } from 'crossws'
import type { RealtimeEvent } from '#shared/types'

// In-process registry of connected WebSocket peers by user id. For multiple replicas,
// swap this for a pub/sub backend (Redis, NATS, Postgres LISTEN/NOTIFY).
const peersByUser = new Map<string, Set<Peer>>()

export function registerPeer(userId: string, peer: Peer) {
  const set = peersByUser.get(userId) ?? new Set<Peer>()
  set.add(peer)
  peersByUser.set(userId, set)
}

export function unregisterPeer(userId: string, peer: Peer) {
  const set = peersByUser.get(userId)
  if (!set) return
  set.delete(peer)
  if (set.size === 0) peersByUser.delete(userId)
}

export function publishToUsers(userIds: Iterable<string>, event: RealtimeEvent) {
  const payload = JSON.stringify(event)
  for (const id of userIds) {
    for (const peer of peersByUser.get(id) ?? []) peer.send(payload)
  }
}

export function connectedUserCount(): number {
  return peersByUser.size
}
