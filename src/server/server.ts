import {once} from 'node:events'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {context, reddit} from '@devvit/web/server'
import type {
  PartialJsonValue,
  TriggerResponse,
  UiResponse,
} from '@devvit/web/shared'
import {
  Endpoint,
  EndpointMethod,
  type DailyRsp,
  type ErrorRsp,
  type LeaderRow,
  type LeaderboardRsp,
  type ScoreReq,
  type ScoreRsp,
  type CommentRsp,
} from '../shared/api.ts'
import {buildBoard, dayString, puzzleNumber} from '../shared/board.ts'
import {validateRun} from '../shared/score.ts'
import {
  composite,
  dbGetCommentId,
  dbSetCommentId,
  dbCount,
  dbGetBest,
  dbGetNames,
  dbRank,
  dbRateLimit,
  dbSaveScore,
  dbSetName,
  dbTop,
  decompose,
} from './db.ts'

type AnyRsp =
  | DailyRsp
  | ScoreRsp
  | LeaderboardRsp
  | CommentRsp
  | UiResponse
  | TriggerResponse
  | ErrorRsp

export async function onReq(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  try {
    await route(reqMsg, rspMsg)
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`
    console.error(msg)
    writeJson<ErrorRsp>(500, {error: msg, status: 500}, rspMsg)
  }
}

async function route(
  reqMsg: IncomingMessage,
  rspMsg: ServerResponse,
): Promise<void> {
  const endpoint = reqMsg.url?.slice(1) as Endpoint
  const method = EndpointMethod[endpoint]

  let rsp: AnyRsp
  if (method !== reqMsg.method) {
    rsp = {error: 'not found', status: 404}
  } else {
    switch (endpoint) {
      case Endpoint.Daily:
        rsp = await routeDaily()
        break
      case Endpoint.Score:
        rsp = await routeScore(reqMsg)
        break
      case Endpoint.Leaderboard:
        rsp = await routeLeaderboard()
        break
      case Endpoint.Comment:
        rsp = await routeComment()
        break
      case Endpoint.OnMenuNewPost:
        rsp = await routeMenuNewPost()
        break
      case Endpoint.OnAppInstall:
        rsp = await routeAppInstall()
        break
      default:
        endpoint satisfies never
        rsp = {error: 'not found', status: 404}
        break
    }
  }

  writeJson<PartialJsonValue>('status' in rsp ? rsp.status : 200, rsp, rspMsg)
}

/** The server owns the clock. The client never decides which day it is. */
function today(): string {
  return dayString(new Date())
}

async function routeDaily(): Promise<DailyRsp> {
  const day = today()
  const board = buildBoard(day)

  const uid = context.userId
  const yourBest = uid ? await dbGetBest(day, uid) : undefined

  const nextUtc = Date.parse(`${day}T00:00:00Z`) + 86_400_000
  return {
    board,
    puzzle: puzzleNumber(day),
    yourBest,
    secondsUntilNext: Math.max(0, Math.floor((nextUtc - Date.now()) / 1000)),
  }
}

async function routeScore(reqMsg: IncomingMessage): Promise<ScoreRsp | ErrorRsp> {
  const uid = context.userId
  if (!uid) return {error: 'not logged in', status: 401}

  const day = today()
  const req = await readJson<ScoreReq>(reqMsg)

  const iceLvl = buildBoard(day).iceLvl        // server-derived, never trusted from client
  const check = validateRun(req, day, iceLvl)
  if (!check.ok) return {error: check.reason, status: 400}

  if (!(await dbRateLimit(day, uid)))
    return {error: 'too many submissions', status: 429}

  // Cache the username now so the leaderboard needs no Reddit API calls later.
  const name = await reddit.getCurrentUsername()
  if (name) await dbSetName(uid, name)

  const score = composite(req.holesSunk, req.bankedMs)
  const saved = await dbSaveScore(day, uid, score)
  const best = (await dbGetBest(day, uid)) ?? decompose(score)
  const rank = await dbRank(day, uid)

  return {saved, best, rank}
}

async function routeLeaderboard(): Promise<LeaderboardRsp> {
  const day = today()
  const [total, top] = await Promise.all([dbCount(day), dbTop(day, 20)])
  const names = await dbGetNames(top.map(r => r.member))

  const entries: LeaderRow[] = top.map((r, i) => ({
    rank: i + 1,
    name: names[i] ?? 'anonymous',
    ...decompose(r.score),
  }))

  let you: LeaderRow | undefined
  const uid = context.userId
  if (uid) {
    const best = await dbGetBest(day, uid)
    const rank = await dbRank(day, uid)
    if (best && rank != null) {
      const [name] = await dbGetNames([uid])
      you = {rank, name: name ?? 'you', ...best}
    }
  }

  return {day, total, entries, you}
}

/**
 * POST /api/comment — post the player's daily result as a comment, ONE per day.
 * If they already commented today, edit that comment (upsert) instead of spamming.
 */
async function routeComment(): Promise<CommentRsp | ErrorRsp> {
  const uid = context.userId
  if (!uid) return {error: 'not logged in', status: 401}
  const postId = context.postId
  if (!postId) return {error: 'no post context', status: 400}

  const day = today()
  const best = await dbGetBest(day, uid)
  if (!best) return {posted: false, updated: false, reason: 'no score yet today'}

  const puzzle = puzzleNumber(day)
  const text =
    `🧊 **Daily Thaw #${String(puzzle).padStart(3, '0')}** — rescued ${best.holesSunk}/5, ` +
    `banked ${(best.bankedMs / 1000).toFixed(1)}s`

  const existingId = await dbGetCommentId(day, uid)
  if (existingId) {
    // upsert: edit the comment we already made today
    try {
      const c = await reddit.getCommentById(existingId)
      await c.edit({text})
      return {posted: false, updated: true}
    } catch {
      // comment was deleted/unavailable — fall through and make a fresh one
    }
  }

  const comment = await reddit.submitComment({id: postId, text, runAs: 'USER'})
  await dbSetCommentId(day, uid, comment.id)
  return {posted: true, updated: false}
}

async function routeMenuNewPost(): Promise<UiResponse> {
  const post = await reddit.submitCustomPost({title: context.appSlug})
  return {
    showToast: {text: `Post ${post.id} created.`, appearance: 'success'},
    navigateTo: post.url,
  }
}

async function routeAppInstall(): Promise<TriggerResponse> {
  await reddit.submitCustomPost({title: context.appSlug})
  return {}
}

async function readJson<T>(reqMsg: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = []
  reqMsg.on('data', chunk => chunks.push(chunk))
  await once(reqMsg, 'end')
  return JSON.parse(`${Buffer.concat(chunks)}`)
}

function writeJson<T extends PartialJsonValue>(
  status: number,
  json: Readonly<T>,
  rsp: ServerResponse,
): void {
  const body = JSON.stringify(json)
  rsp.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  })
  rsp.end(body)
}