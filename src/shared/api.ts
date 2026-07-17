export enum Endpoint {
  Daily = 'api/daily',
  Score = 'api/score',
  Leaderboard = 'api/leaderboard',
  Comment = 'api/comment',
  OnMenuNewPost = 'internal/on/menu/new-post',
  OnAppInstall = 'internal/on/app/install',
}

export const EndpointMethod: Readonly<Record<Endpoint, string>> = {
  [Endpoint.Daily]: 'GET',
  [Endpoint.Score]: 'POST',
  [Endpoint.Leaderboard]: 'GET',
  [Endpoint.Comment]: 'POST',
  [Endpoint.OnMenuNewPost]: 'POST',
  [Endpoint.OnAppInstall]: 'POST',
}

export type ErrorRsp = {error: string; status: number}

export type Hole = {
  sx: number
  hyN: number
  kind: 'target' | 'decoy'
  ord?: number
}

export type Board = {
  day: string
  iceLvl: number
  barFric: number
  holes: Hole[]
  targetSeq: number[]
}

export type Best = {holesSunk: number; bankedMs: number}

export type DailyRsp = {
  board: Board
  puzzle: number
  yourBest?: Best
  secondsUntilNext: number
}

export type ScoreReq = {
  day: string
  holesSunk: number
  bankedMs: number
  wrongHoles: number
  elapsedMs: number
}

export type ScoreRsp = {saved: boolean; best: Best; rank?: number}

export type LeaderRow = {
  rank: number
  name: string
  holesSunk: number
  bankedMs: number
}

export type CommentReq = {day: string}
export type CommentRsp = {posted: boolean; updated: boolean; reason?: string}

export type LeaderboardRsp = {
  day: string
  total: number
  entries: LeaderRow[]
  you?: LeaderRow
}