/**
 * 游戏结果表格正负色：只认可信 raw 数值，不解析展示文案。
 * infSign === 1 → result-positive（红）
 * infSign === -1 → result-negative（绿）
 * 无 infSign：raw > 0 红 / raw < 0 绿
 * 0 / 空 / 未结算 → 空 class，沿用当前样式
 */
function resultToneClass(raw, infSign) {
  var sign = Number(infSign);
  if (sign === 1) return "result-positive";
  if (sign === -1) return "result-negative";
  if (raw === null || raw === undefined) return "";
  if (raw === "") return "";
  if (raw === "-") return "";
  if (typeof raw === "boolean") return "";
  var n = typeof raw === "number" ? raw : Number(raw);
  if (!isFinite(n)) return "";
  if (n > 0) return "result-positive";
  if (n < 0) return "result-negative";
  return "";
}

module.exports = {
  resultToneClass: resultToneClass
};
