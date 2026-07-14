import {
  Endpoint,
  type CommentRsp,
  type DailyRsp,
  type LeaderboardRsp,
  type ScoreReq,
  type ScoreRsp,
} from '../shared/api.ts'

async function get<T>(endpoint: Endpoint): Promise<T | undefined> {
  let rsp
  try {
    rsp = await fetch(endpoint, {headers: {Accept: 'application/json'}})
  } catch (err) {
    console.error(`HTTP error: ${err instanceof Error ? err.message : err}`)
    return
  }
  if (!rsp.ok) {
    const text = await rsp.text().catch(() => '')
    console.error(`HTTP status ${rsp.status}: ${rsp.statusText}; ${text}`)
    return
  }
  return (await rsp.json()) as T
}

export async function fetchDaily(): Promise<DailyRsp | undefined> {
  return get<DailyRsp>(Endpoint.Daily)
}

export async function fetchLeaderboard(): Promise<LeaderboardRsp | undefined> {
  return get<LeaderboardRsp>(Endpoint.Leaderboard)
}

export async function fetchSubmitScore(
  req: ScoreReq,
): Promise<ScoreRsp | undefined> {
  let rsp
  try {
    rsp = await fetch(Endpoint.Score, {
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      method: 'POST',
      body: JSON.stringify(req),
    })
  } catch (err) {
    console.error(`HTTP error: ${err instanceof Error ? err.message : err}`)
    return
  }
  if (!rsp.ok) {
    const text = await rsp.text().catch(() => '')
    console.error(`HTTP status ${rsp.status}: ${rsp.statusText}; ${text}`)
    return
  }
  return (await rsp.json()) as ScoreRsp
}

export async function fetchPostComment(day: string): Promise<CommentRsp | undefined> {
  let rsp
  try {
    rsp = await fetch(Endpoint.Comment, {
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      method: 'POST',
      body: JSON.stringify({day}),
    })
  } catch (err) {
    console.error(`HTTP error: ${err instanceof Error ? err.message : err}`)
    return
  }
  if (!rsp.ok) {
    const text = await rsp.text().catch(() => '')
    console.error(`HTTP status ${rsp.status}: ${rsp.statusText}; ${text}`)
    return
  }
  return (await rsp.json()) as CommentRsp
}

/** "New thaw in 04:12:37" — the cheapest retention mechanic there is. */
export function formatCountdown(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':')
}