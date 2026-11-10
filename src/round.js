// FP-002: выбор раунда. rng-композиция (пин): r1 -> компания floor(r1*n),
// r2 < 0.5 -> revenue; cutoffIndex = floor(0.6*len(points)); показываются
// точки 0..cutoffIndex-1, рисуются cutoffIndex..n-1.
export function pickRound(companies, rng) {
  if (!Array.isArray(companies) || companies.length === 0) {
    throw new Error('pickRound: companies — непустой массив обязателен');
  }
  if (typeof rng !== 'function') {
    throw new Error('pickRound: rng — функция обязательна');
  }
  const r1 = rng();
  const r2 = rng();
  const company = companies[Math.floor(r1 * companies.length)];
  const metric = r2 < 0.5 ? 'revenue' : 'net_income';
  if (!company || !company[metric]) {
    throw new Error(`pickRound: у компании нет ряда ${metric}`);
  }
  const years = Object.keys(company[metric]).map(Number).sort((a, b) => a - b);
  const points = years.map((year) => ({
    year,
    value: company[metric][String(year)],
  }));
  const cutoffIndex = Math.floor(0.6 * points.length);
  return { ticker: company.ticker, metric, points, cutoffIndex };
}
