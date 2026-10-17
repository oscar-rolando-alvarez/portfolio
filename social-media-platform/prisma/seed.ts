// Demo data: `npm run db:seed` (idempotent: wipes and recreates demo content).
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../server/generated/prisma/client'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required to seed the database')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
const DEMO_PASSWORD = 'Password123'
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

async function main() {
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.user.deleteMany()
  ])

  const password = await bcrypt.hash(DEMO_PASSWORD, 10)
  const people = [
    { username: 'alice', displayName: 'Alice Johnson', bio: 'Product designer. Coffee, typography and trail running.', verified: true },
    { username: 'bob', displayName: 'Bob Martinez', bio: 'Backend engineer who likes boring, reliable systems.' },
    { username: 'carol', displayName: 'Carol Chen', bio: 'Photographer based in Vancouver.' },
    { username: 'dave', displayName: 'Dave Okafor', bio: 'Building things with Vue and Nuxt.' }
  ]
  const users = await Promise.all(people.map(p => prisma.user.create({
    data: { ...p, email: `${p.username}@example.com`, password }
  })))
  const [alice, bob, carol, dave] = users as [typeof users[0], typeof users[0], typeof users[0], typeof users[0]]

  await prisma.follow.createMany({
    data: [
      { followerId: alice.id, followingId: bob.id },
      { followerId: alice.id, followingId: carol.id },
      { followerId: bob.id, followingId: alice.id },
      { followerId: carol.id, followingId: alice.id },
      { followerId: dave.id, followingId: alice.id }
    ]
  })

  const posts = await Promise.all([
    prisma.post.create({ data: { authorId: alice.id, content: 'Shipped the new onboarding flow today. Completion rate up 18% in the first hour!', createdAt: hoursAgo(2) } }),
    prisma.post.create({ data: { authorId: bob.id, content: 'Hot take: most queues should just be a Postgres table with SKIP LOCKED.', createdAt: hoursAgo(5) } }),
    prisma.post.create({ data: { authorId: carol.id, content: 'Golden hour at English Bay.', images: ['https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1200'], createdAt: hoursAgo(9) } }),
    prisma.post.create({ data: { authorId: dave.id, content: 'Nuxt 4 + Prisma 7 driver adapters are a really pleasant combo.', createdAt: hoursAgo(20) } }),
    prisma.post.create({ data: { authorId: bob.id, content: 'Followers-only: our team offsite photos are up.', visibility: 'FOLLOWERS', createdAt: hoursAgo(30) } })
  ])

  await prisma.like.createMany({
    data: [
      { userId: bob.id, postId: posts[0].id },
      { userId: carol.id, postId: posts[0].id },
      { userId: dave.id, postId: posts[0].id },
      { userId: alice.id, postId: posts[1].id },
      { userId: alice.id, postId: posts[2].id }
    ]
  })
  await prisma.comment.createMany({
    data: [
      { postId: posts[0].id, authorId: bob.id, content: 'Huge! What changed?' },
      { postId: posts[0].id, authorId: alice.id, content: 'Fewer steps and a progress indicator.' },
      { postId: posts[1].id, authorId: dave.id, content: 'Until you need fan-out, yes.' }
    ]
  })

  const conversation = await prisma.conversation.create({
    data: { participants: { create: [{ userId: alice.id }, { userId: bob.id }] }, lastMessageAt: hoursAgo(1) }
  })
  await prisma.message.createMany({
    data: [
      { conversationId: conversation.id, senderId: bob.id, content: 'Lunch tomorrow?', createdAt: hoursAgo(1.2) },
      { conversationId: conversation.id, senderId: alice.id, content: 'Sure, 12:30 works.', createdAt: hoursAgo(1) }
    ]
  })

  console.log(`Seeded ${users.length} users (password: ${DEMO_PASSWORD}) and ${posts.length} posts`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
