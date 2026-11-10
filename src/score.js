// FP-002: очки. avgMiss = mean(|g-a|) по скрытой части;
// points = round(100*max(0, 1 - avgMiss/(yMax-yMin))).
export function score(guess, actual, yMin, yMax) {
  if (!Array.isArray(guess) || !Array.isArray(actual)) {
    throw new Error('score: guess и actual — массивы');
  }
  if (guess.length !== actual.length) {
    throw new Error(`score: длины не совпадают (${guess.length} != ${actual.length})`);
  }
  if (guess.length === 0) {
    throw new Error('score: пустые ряды');
  }
  if (!(yMax > yMin)) {
    throw new Error('score: требуется yMax > yMin');
  }
  const misses = guess.map((g, i) => Math.abs(g - actual[i]));
  const avgMiss = misses.reduce((sum, m) => sum + m, 0) / misses.length;
  const points = Math.round(100 * Math.max(0, 1 - avgMiss / (yMax - yMin)));
  return { avgMiss, points };
}
