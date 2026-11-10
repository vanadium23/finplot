// FP-002: fail-fast загрузка датасета (контракт FP-001 заморожен).
// Бросает при: невалидном JSON, отсутствии companies, компании без обоих
// рядов, ряде <12 точек, дыре (шаг != 1 год), нуле внутри ряда
// (кроме первой точки), нечисловом значении. Fail-fast по каждой компании.
const MIN_POINTS = 12;

function validateRow(ticker, metric, row) {
  const label = `${ticker}/${metric}`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${label}: ряд отсутствует или не объект`);
  }
  const years = Object.keys(row).map(Number);
  if (years.some((y) => !Number.isInteger(y))) {
    throw new Error(`${label}: ключи ряда должны быть годами`);
  }
  years.sort((x, y) => x - y);
  if (years.length < MIN_POINTS) {
    throw new Error(`${label}: ${years.length} точек, минимум ${MIN_POINTS}`);
  }
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const value = row[String(year)];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${label}: ${year} — значение не конечное число`);
    }
    if (i > 0 && year - years[i - 1] !== 1) {
      throw new Error(`${label}: дыра между ${years[i - 1]} и ${year}`);
    }
    if (i > 0 && value === 0) {
      throw new Error(`${label}: ноль внутри ряда в ${year}`);
    }
  }
}

export function loadDataset(rawJsonText) {
  let data;
  try {
    data = JSON.parse(rawJsonText);
  } catch (e) {
    throw new Error(`loadDataset: невалидный JSON (${e.message})`);
  }
  if (
    !data || typeof data !== 'object' || Array.isArray(data) ||
    !Array.isArray(data.companies) || data.companies.length === 0
  ) {
    throw new Error('loadDataset: ожидается объект с непустым массивом companies');
  }
  for (const company of data.companies) {
    if (!company || typeof company !== 'object' || Array.isArray(company)) {
      throw new Error('loadDataset: компания не объект');
    }
    if (typeof company.ticker !== 'string' || company.ticker === '') {
      throw new Error('loadDataset: компания без ticker');
    }
    validateRow(company.ticker, 'revenue', company.revenue);
    validateRow(company.ticker, 'net_income', company.net_income);
  }
  return { companies: data.companies };
}
