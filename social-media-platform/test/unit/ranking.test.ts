import { describe, expect, it } from 'vitest'
import { rankFeed, scorePost } from '../../server/utils/ranking'

const now = new Date('2026-06-01T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
const ctx = { now, viewerId: 'me', followingIds: new Set(['friend']) }

const post = (id: string, authorId: string, ageHours: number, likesCount = 0, commentsCount = 0) =>
  ({ id, authorId, createdAt: hoursAgo(ageHours), likesCount, commentsCount })

describe('scorePost', () => {
  it('decays with age', () => {
    expect(scorePost(post('a', 'x', 1), ctx)).toBeGreaterThan(scorePost(post('b', 'x', 24), ctx))
  })

  it('rewards engagement, weighting comments above likes', () => {
    const liked = scorePost(post('a', 'x', 3, 2, 0), ctx)
    const commented = scorePost(post('b', 'x', 3, 0, 2), ctx)
    expect(commented).toBeGreaterThan(liked)
    expect(liked).toBeGreaterThan(scorePost(post('c', 'x', 3), ctx))
  })

  it('boosts followed authors and the viewer', () => {
    const stranger = scorePost(post('a', 'stranger', 3), ctx)
    expect(scorePost(post('b', 'friend', 3), ctx)).toBeCloseTo(stranger * 1.5)
    expect(scorePost(post('c', 'me', 3), ctx)).toBeCloseTo(stranger * 1.5)
  })

  it('never produces negative or infinite scores for future timestamps', () => {
    const score = scorePost(post('a', 'x', -5), ctx)
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThan(0)
  })
})

describe('rankFeed', () => {
  const posts = [
    post('old-viral', 'x', 48, 50, 10),
    post('fresh', 'x', 0.5),
    post('friend', 'friend', 2, 1),
    post('mid', 'y', 6, 3)
  ]

  it('orders by score and paginates', () => {
    const first = rankFeed(posts, ctx, 1, 2)
    expect(first.items).toHaveLength(2)
    expect(first.nextPage).toBe(2)
    const second = rankFeed(posts, ctx, 2, 2)
    expect(second.nextPage).toBeNull()
    const ids = [...first.items, ...second.items].map(p => p.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('ranks a fresh post from a followed author above an old viral one', () => {
    const ids = rankFeed(posts, ctx, 1, 10).items.map(p => p.id)
    expect(ids.indexOf('friend')).toBeLessThan(ids.indexOf('old-viral'))
  })

  it('returns an empty page past the end', () => {
    expect(rankFeed(posts, ctx, 5, 10)).toEqual({ items: [], nextPage: null })
  })
})
