import {redis} from '@devvit/web/server'
import type {Best} from '../shared/api.ts'
import {composite, decompose, MAX_BANKED_MS} from '../shared/score.ts'
export {composite, decompose, MAX_BANKED_MS}

const TTL = 60 * 60 * 24 * 14 // keep two weeks of boards

const lbKey = (day: string): string => `lb:${day}`
const bestKey = (day: string, uid: string): string => `u:${day}:${uid}`
const rateKey = (day: string, uid: string): string => `rate:${day}:${uid}`
const nameKey = (uid: string): string => `name:${uid}`
const commentKey = (day: string, uid: string): string => `cmt:${day}:${uid}`

export async function dbGetBest(day: string, uid: string): Promise<Best | undefined> {
  const raw = await redis.get(bestKey(day, uid))
  return raw ? decompose(Number(raw)) : undefined
}

/** Returns true when this run beat the user's previous best for the day. */
export async function dbSaveScore(
  day: string,
  uid: string,
  score: number,
): Promise<boolean> {
  const raw = await redis.get(bestKey(day, uid))
  const prev = raw ? Number(raw) : -1
  if (score <= prev) return false

  await redis.set(bestKey(day, uid), String(score))
  await redis.expire(bestKey(day, uid), TTL)
  await redis.zAdd(lbKey(day), {member: uid, score})
  await redis.expire(lbKey(day), TTL)
  return true
}

/** Cheap rate limit. A daily game does not need 60 submissions an hour. */
export async function dbRateLimit(day: string, uid: string): Promise<boolean> {
  const hits = await redis.incrBy(rateKey(day, uid), 1)
  if (hits === 1) await redis.expire(rateKey(day, uid), 86_400)
  return hits <= 60
}

/**
 * Cache the username once, at submit time. The leaderboard then needs zero
 * Reddit API calls — important on a serverless endpoint that dies per request.
 */
export async function dbSetName(uid: string, name: string): Promise<void> {
  await redis.set(nameKey(uid), name)
  await redis.expire(nameKey(uid), TTL * 4)
}

export async function dbGetNames(uids: string[]): Promise<string[]> {
  return Promise.all(
    uids.map(async uid => (await redis.get(nameKey(uid))) ?? 'anonymous'),
  )
}

/** The comment id this user already posted today, if any. */
export async function dbGetCommentId(day: string, uid: string): Promise<string | undefined> {
  return (await redis.get(commentKey(day, uid))) ?? undefined
}

export async function dbSetCommentId(day: string, uid: string, commentId: string): Promise<void> {
  await redis.set(commentKey(day, uid), commentId)
  await redis.expire(commentKey(day, uid), 60 * 60 * 24 * 14)
}

export async function dbCount(day: string): Promise<number> {
  return redis.zCard(lbKey(day))
}

/** Descending: Redis ranks ascending, so read the tail and flip it. */
export async function dbTop(
  day: string,
  n: number,
): Promise<{member: string; score: number}[]> {
  const total = await redis.zCard(lbKey(day))
  if (total === 0) return []
  const start = Math.max(0, total - n)
  const rows = await redis.zRange(lbKey(day), start, total - 1, {by: 'rank'})
  return rows.reverse()
}

/** Convert Redis' ascending rank into a human "you are #3 of 900". */
export async function dbRank(day: string, uid: string): Promise<number | undefined> {
  const total = await redis.zCard(lbKey(day))
  const asc = await redis.zRank(lbKey(day), uid)
  if (asc == null) return undefined
  return total - asc
}