/**
 * Server-side writing statistics models — mirror of the
 * `/api/v1/stats` API responses.
 */

/** A single day's word total in a daily-series chart. */
export interface DailyWordPoint {
  /** ISO date (YYYY-MM-DD). */
  day: string;
  /** Net positive words written that day. */
  words: number;
}

/** A contributor's total word output within the queried window. */
export interface ContributorWords {
  userId: string;
  username: string | null;
  words: number;
}

/** Response from `GET /api/v1/stats/projects/:username/:slug`. */
export interface ProjectStatsResponse {
  projectId: string;
  windowDays: number;
  totalWords: number;
  daily: DailyWordPoint[];
  contributors: ContributorWords[];
}

/** Response from `GET /api/v1/stats/me`. */
export interface UserStatsResponse {
  windowDays: number;
  projectCount: number;
  totalWords: number;
  daily: DailyWordPoint[];
}
