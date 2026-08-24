function normalizeMinus(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/[\u2212\u2013\u2014]/g, "-");
}

function parseRelativeScore(value) {
  const normalized = normalizeMinus(value).toUpperCase();
  if (!normalized) return null;
  if (normalized === "E" || normalized === "EVEN") return 0;
  if (!/^[+-]?\d+$/.test(normalized)) return null;
  const number = Number.parseInt(normalized, 10);
  return Number.isFinite(number) && number >= -9 && number <= 9 ? number : null;
}

function parseStrokeScore(value) {
  const normalized = String(value == null ? "" : value).trim();
  if (!/^\d{1,2}$/.test(normalized)) return null;
  const number = Number.parseInt(normalized, 10);
  return Number.isFinite(number) && number >= 1 && number <= 19 ? number : null;
}

function splitScores(value) {
  return String(value == null ? "" : value)
    .split(/[\s,，、/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 18);
}

function parseScoreInput(value, mode) {
  const parser = mode === "relative" ? parseRelativeScore : parseStrokeScore;
  const output = splitScores(value).map((item) => {
    const score = parser(item);
    return score === null ? "" : mode === "relative" && score > 0 ? `+${score}` : String(score);
  });
  while (output.length < 18) output.push("");
  return output;
}

function formatScoreInput(scores) {
  return scores.filter((item) => item !== "").join(" ");
}

function formatRelativeScore(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : String(value).replace("-", "\u2212");
}

function nineHoleStrokeTotal(model, start) {
  const startIndex = start >= 9 ? 9 : 0;
  const scoreSets = (model && (model.scoreSets || model.scoreSets)) || {};
  const strokes = scoreSets.strokes || [];
  const relatives = scoreSets.relative || [];
  const pars = model && (model.holePars || model.holePars);
  const holePars = Array.isArray(pars) ? pars : [];
  let sum = 0;
  let count = 0;
  for (let index = startIndex; index < startIndex + 9; index += 1) {
    const stroke = parseStrokeScore(strokes[index]);
    if (stroke !== null) {
      sum += stroke;
      count += 1;
      continue;
    }
    const relative = parseRelativeScore(relatives[index]);
    if (relative === null) continue;
    const par = Number(holePars[index]);
    const holePar = Number.isFinite(par) && par > 0 ? par : 4;
    sum += holePar + relative;
    count += 1;
  }
  return count ? sum : null;
}

function holeParAt(model, index) {
  const pars = model && Array.isArray(model.holePars) ? model.holePars : [];
  const par = Number(pars[index]);
  return Number.isFinite(par) && par > 0 ? par : 4;
}

function calculateTotal(model) {
  const scores = (model && model.scoreSets && model.scoreSets[model.scoreMode]) || [];
  if (model.scoreMode === "strokes") {
    let total = 0;
    let relative = 0;
    let count = 0;
    scores.forEach((score, index) => {
      const value = parseStrokeScore(score);
      if (value === null) return;
      total += value;
      relative += value - holeParAt(model, index);
      count += 1;
    });
    return {
      count: count,
      relative: count ? relative : null,
      total: count ? total : null
    };
  }
  const values = scores.map(parseRelativeScore).filter((value) => value !== null);
  const difference = values.reduce((sum, value) => sum + value, 0);
  const par = Number.isFinite(model.roundPar) ? model.roundPar : null;
  return {
    count: values.length,
    relative: values.length ? difference : null,
    total: values.length && par !== null ? par + difference : null
  };
}

module.exports = {
  parseRelativeScore,
  parseStrokeScore,
  parseRelativeScore: parseRelativeScore,
  parseStrokeScore: parseStrokeScore,
  parseScoreInput,
  formatScoreInput,
  formatRelativeScore,
  nineHoleStrokeTotal,
  calculateTotal
};
