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

function calculateTotal(model) {
  const scores = model.scoreSets[model.scoreMode] || [];
  if (model.scoreMode === "strokes") {
    const values = scores.map(parseStrokeScore).filter((value) => value !== null);
    return {
      count: values.length,
      relative: null,
      total: values.length ? values.reduce((sum, value) => sum + value, 0) : null
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
  parseScoreInput,
  formatScoreInput,
  formatRelativeScore,
  calculateTotal
};
