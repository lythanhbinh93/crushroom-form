// Given an array of LHR JSONs from N runs, return:
//   { lhr, score, index, allScores } where lhr is the run whose performance
//   score is the median across the set. For even N, returns the lower of the
//   two middle scores (the more pessimistic median).
//
// Score range: 0..1 (Lighthouse internal). Caller may *100 for display.

export function pickMedianLhr(lhrs) {
  if (!Array.isArray(lhrs) || !lhrs.length) {
    throw new Error('pickMedianLhr: empty lhrs array');
  }
  const scored = lhrs.map((lhr, index) => ({
    index,
    lhr,
    score: lhr?.categories?.performance?.score ?? null,
  }));
  if (scored.some((s) => s.score == null)) {
    throw new Error('pickMedianLhr: at least one run missing performance.score');
  }
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const medianIndex = Math.floor((sorted.length - 1) / 2);
  const chosen = sorted[medianIndex];
  return {
    lhr: chosen.lhr,
    score: chosen.score,
    index: chosen.index,
    allScores: scored.map((s) => s.score),
  };
}
