/**
 * How the admin's metrics split viewers. Today that is what the activity log
 * can tell apart: signed out vs signed in. Phase 31 (community accounts)
 * turns it into anonymous / community / student; it changes this list and
 * segmentSql() in src/server/data/viewer-segment.ts, and nothing else.
 */
export const VIEWER_SEGMENTS = [
  { key: "signed_out", label: "Signed out", color: "var(--color-chart-lake)" },
  { key: "signed_in", label: "Signed in", color: "var(--color-chart-maple)" },
] as const;

export type ViewerSegment = (typeof VIEWER_SEGMENTS)[number]["key"];
export type BySegment = Record<ViewerSegment, number>;

export function emptySegments(): BySegment {
  return Object.fromEntries(VIEWER_SEGMENTS.map((s) => [s.key, 0])) as BySegment;
}
