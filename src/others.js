// FP-002: линия-заглушка «Другие» (честно помечается на UI).
// others[0] = hidden[0] (якорь); others[i] = hidden[i] + u*0.15*|hidden[i]-hidden[i-1]|,
// u = 2*rng()-1. Delta — от предыдущей ТОЧКИ ряда (не через якорь).
export function pseudoOthers(hidden, rng) {
  if (!Array.isArray(hidden) || hidden.length === 0) {
    throw new Error('pseudoOthers: hidden — непустой массив');
  }
  if (typeof rng !== 'function') {
    throw new Error('pseudoOthers: rng — функция обязательна');
  }
  const others = [hidden[0]];
  let prev = hidden[0];
  for (let i = 1; i < hidden.length; i++) {
    const u = 2 * rng() - 1;
    others.push(hidden[i] + u * 0.15 * Math.abs(hidden[i] - prev));
    prev = hidden[i];
  }
  return others;
}
