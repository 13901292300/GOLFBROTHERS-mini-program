/**
 * 游戏结果单元格统一格式化。
 * pending / not-applicable → 空白；settled → 含合法 0。
 */
var core = require("./settleCore.js");

var STATUS_PENDING = "pending";
var STATUS_SETTLED = "settled";
var STATUS_NA = "not-applicable";

/**
 * @param {{ status?: string, value?: number|null }} result
 * @returns {string}
 */
function formatGameResultCell(result) {
  if (!result || typeof result !== "object") return "";
  var status = String(result.status || "");
  if (status === STATUS_PENDING || status === STATUS_NA) return "";
  if (status !== STATUS_SETTLED) return "";
  if (result.value == null || result.value === "") return "";
  var n = Number(result.value);
  if (!isFinite(n)) return "";
  return core.formatPoints(n);
}

/**
 * 由投影层 played/inGame 构造 cell。
 */
function formatBoardCell(opts) {
  opts = opts || {};
  if (!opts.inGame) {
    return {
      text: "",
      raw: null,
      cls: "",
      status: STATUS_NA,
      played: false
    };
  }
  if (!opts.played) {
    return {
      text: "",
      raw: null,
      cls: "",
      status: STATUS_PENDING,
      played: false
    };
  }
  var n = Number(opts.raw);
  if (!isFinite(n)) n = 0;
  return {
    text: core.formatPoints(n),
    raw: core.round1(n),
    cls: opts.cls != null ? opts.cls : "",
    status: STATUS_SETTLED,
    played: true,
    settledCount: 1
  };
}

/**
 * 汇总行：settledCount===0 → 空白；否则显示 value（含 0）。
 */
function formatBoardTotal(opts) {
  opts = opts || {};
  var count = Number(opts.settledCount) || 0;
  if (count <= 0) {
    return {
      text: "",
      raw: null,
      cls: "",
      status: STATUS_PENDING,
      played: false,
      settledCount: 0
    };
  }
  var n = Number(opts.value);
  if (!isFinite(n)) n = 0;
  return {
    text: core.formatPoints(n),
    raw: core.round1(n),
    cls: opts.cls != null ? opts.cls : "",
    status: STATUS_SETTLED,
    played: true,
    settledCount: count
  };
}

module.exports = {
  STATUS_PENDING: STATUS_PENDING,
  STATUS_SETTLED: STATUS_SETTLED,
  STATUS_NA: STATUS_NA,
  formatGameResultCell: formatGameResultCell,
  formatBoardCell: formatBoardCell,
  formatBoardTotal: formatBoardTotal
};
