/**
 * 8421 快捷分值码。UI 只编辑 4/5 位 scoreCode；老鹰/HIO 由原 expand 规则派生。
 *
 * 4 位：m1, par, p1, p2；缺省 p3 沿用原实现（按 0）。
 * 5 位：第 5 位只表示 p3，绝不表示老鹰。
 * 老鹰 m2 = m1×2，HIO hio = m1×4。
 */
var BANDS = ["hio", "m2", "m1", "par", "p1", "p2", "p3"];

function configuredNumber(raw) {
  if (raw == null || raw === "") return null;
  var n = Number(raw);
  return isFinite(n) ? n : null;
}

function isValidScoreCode(code) {
  return /^\d{4,5}$/.test(String(code == null ? "" : code).trim());
}

function expandScoreCode(code) {
  var digits = String(code || "")
    .replace(/\D/g, "")
    .split("")
    .map(function (ch) {
      return Number(ch);
    });
  digits = digits.filter(function (n) {
    return isFinite(n);
  });
  if (digits.length !== 4 && digits.length !== 5) return null;
  var m1 = digits[0];
  var map = {
    m1: m1,
    par: digits[1],
    p1: digits[2],
    p2: digits[3],
    m2: m1 * 2,
    hio: m1 * 4
  };
  if (digits.length >= 5) map.p3 = digits[4];
  else map.p3 = 0;
  return map;
}

function rowValue(rows, id) {
  var i;
  for (i = 0; i < (rows || []).length; i++) {
    if (rows[i] && String(rows[i].id) === String(id)) {
      return configuredNumber(rows[i].value);
    }
  }
  return null;
}

function scoreCodeFromRows(rows) {
  var m1 = rowValue(rows, "m1");
  var par = rowValue(rows, "par");
  var p1 = rowValue(rows, "p1");
  var p2 = rowValue(rows, "p2");
  var p3 = rowValue(rows, "p3");
  var m2 = rowValue(rows, "m2");
  var hio = rowValue(rows, "hio");
  if (m1 == null || par == null || p1 == null || p2 == null) {
    return { ok: false, code: "", reason: "incomplete" };
  }
  if (m2 != null && m2 !== m1 * 2) return { ok: false, code: "", reason: "eagle-mismatch" };
  if (hio != null && hio !== m1 * 4) return { ok: false, code: "", reason: "hio-mismatch" };
  var code = String(m1) + String(par) + String(p1) + String(p2);
  if (p3 != null && p3 !== 0) code += String(p3);
  if (!isValidScoreCode(code)) return { ok: false, code: "", reason: "invalid-digits" };
  return { ok: true, code: code };
}

function mapFromLegacyRows(rows) {
  var out = expandScoreCode("8421");
  (rows || []).forEach(function (row) {
    if (!row || row.id == null) return;
    var v = configuredNumber(row.value);
    if (v == null) return;
    out[String(row.id)] = v;
  });
  return out;
}

function hydratePlayerScore(player) {
  var p = player && typeof player === "object" ? player : {};
  var code = p.scoreCode != null ? String(p.scoreCode).trim() : "";
  if (isValidScoreCode(code)) {
    return {
      scoreCode: code,
      scoreRows: p.scoreRows,
      lossless: true,
      usedCode: true
    };
  }
  var conv = scoreCodeFromRows(p.scoreRows);
  if (conv.ok) {
    return {
      scoreCode: conv.code,
      scoreRows: p.scoreRows,
      lossless: true,
      usedCode: true
    };
  }
  if (p.scoreRows && p.scoreRows.length) {
    return {
      scoreCode: code || "",
      scoreRows: p.scoreRows,
      lossless: false,
      usedCode: false
    };
  }
  return {
    scoreCode: code || "8421",
    scoreRows: p.scoreRows,
    lossless: true,
    usedCode: true
  };
}

function resolveScoreMap(game, player, rule) {
  var p = player || {};
  var code = p.scoreCode != null ? String(p.scoreCode).trim() : "";
  if (isValidScoreCode(code)) return expandScoreCode(code);
  if (p.scoreRows && p.scoreRows.length) {
    var conv = scoreCodeFromRows(p.scoreRows);
    if (conv.ok) return expandScoreCode(conv.code);
    return mapFromLegacyRows(p.scoreRows);
  }
  var def = String((p.scoreCode || (game && game.defaultScoreCode) || (rule && rule.scoreCode) || "8421").trim());
  if (isValidScoreCode(def)) return expandScoreCode(def);
  return expandScoreCode("8421");
}

function mappedAt(diff, map) {
  map = map || {};
  if (diff <= -3) return configuredNumber(map.hio);
  if (diff === -2) return configuredNumber(map.m2);
  if (diff === -1) return configuredNumber(map.m1);
  if (diff === 0) return configuredNumber(map.par);
  if (diff === 1) return configuredNumber(map.p1);
  if (diff === 2) return configuredNumber(map.p2);
  if (diff === 3) return configuredNumber(map.p3);
  return null;
}

function hasExplicitRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.some(function (row) {
    return row && configuredNumber(row.value) != null;
  });
}

module.exports = {
  BANDS: BANDS,
  SETTLE_VERSION_2: "v53-4.1.3",
  SETTLE_VERSION_3: "v53-4.2.4",
  SETTLE_VERSION_4: "v53-4.3.2",
  expandScoreCode: expandScoreCode,
  isValidScoreCode: isValidScoreCode,
  scoreCodeFromRows: scoreCodeFromRows,
  hydratePlayerScore: hydratePlayerScore,
  resolveScoreMap: resolveScoreMap,
  mappedAt: mappedAt,
  configuredNumber: configuredNumber,
  hasExplicitRows: hasExplicitRows,
  mapFromLegacyRows: mapFromLegacyRows
};
