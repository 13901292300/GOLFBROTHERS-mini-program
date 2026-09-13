/**
 * 游戏结果单元格统一格式化。
 * pending / not-applicable → 空白；settled → 含合法 0。
 * infSign ±1 → ∞ / -∞（不把 Infinity 或 "∞" 当业务 raw）。
 */
var core = require("./settleCore.js");
var specialResult = require("./specialResult.js");
var resultTone = require("./resultTone.js");

var STATUS_PENDING = "pending";
var STATUS_SETTLED = "settled";
var STATUS_NA = "not-applicable";

function infSignOf(opts) {
  return specialResult.asInfSign(opts && opts.infSign);
}

function infCellBase(opts, infSign) {
  var text = specialResult.infText(infSign);
  var cls = opts.cls != null && opts.cls !== "" ? opts.cls : resultTone.resultToneClass(null, infSign);
  return {
    text: text,
    raw: null,
    infSign: infSign,
    cls: cls,
    status: STATUS_SETTLED,
    played: true,
    settledCount: opts.settledCount != null ? Number(opts.settledCount) || 1 : 1
  };
}

/**
 * @param {{ status?: string, value?: number|null, infSign?: number }} result
 * @returns {string}
 */
function formatGameResultCell(result) {
  if (!result || typeof result !== "object") return "";
  var status = String(result.status || "");
  if (status === STATUS_PENDING || status === STATUS_NA) return "";
  if (status !== STATUS_SETTLED) return "";
  var infSign = infSignOf(result);
  if (infSign) return specialResult.infText(infSign);
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
  var infSign = infSignOf(opts);
  if (!opts.inGame) {
    return {
      text: "",
      raw: null,
      infSign: 0,
      cls: "",
      status: STATUS_NA,
      played: false
    };
  }
  if (infSign) {
    return infCellBase(opts, infSign);
  }
  if (!opts.played) {
    return {
      text: "",
      raw: null,
      infSign: 0,
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
    infSign: 0,
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
  var infSign = infSignOf(opts);
  if (count <= 0 && !infSign) {
    return {
      text: "",
      raw: null,
      infSign: 0,
      cls: "",
      status: STATUS_PENDING,
      played: false,
      settledCount: 0
    };
  }
  if (infSign) {
    return Object.assign(infCellBase(opts, infSign), {
      settledCount: count > 0 ? count : 1
    });
  }
  var n = Number(opts.value);
  if (!isFinite(n)) n = 0;
  return {
    text: core.formatPoints(n),
    raw: core.round1(n),
    infSign: 0,
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
