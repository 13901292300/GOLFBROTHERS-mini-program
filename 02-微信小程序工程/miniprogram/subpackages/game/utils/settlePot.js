/**
 * 捐锅（非大锅饭）：从本洞赢家正分中抽出，记入该球员捐锅格。
 * 每洞捐：每人最多捐 N，盈利不足 N 则全捐、不欠锅。
 * 全捐：赢家正分全部入锅，洞内显示为 0。
 * 累计不超过捐满 M；剩余不足时按各赢家拟捐额比例分摊。
 * 大锅饭：同全捐且不截满额；底部金额 = 汇总 × (基金 / 汇总合计)。
 */
const core = require("./settleCore.js");

function applyHolePot(mode, nPer, remaining, ledger, ids) {
  const display = {};
  const donated = {};
  (ids || []).forEach(function (id) {
    display[id] = core.round1(Number(ledger && ledger[id]) || 0);
    donated[id] = 0;
  });
  const capOn = isFinite(Number(remaining)) && Number(remaining) >= 0;
  let rem = capOn ? core.round1(Number(remaining)) : Infinity;
  if (!(rem > 0)) {
    return { display: display, donated: donated, remaining: rem };
  }
  const winners = (ids || []).filter(function (id) {
    return display[id] > 0;
  });
  if (!winners.length) {
    return { display: display, donated: donated, remaining: rem };
  }
  const n = Number(nPer);
  const nSafe = isFinite(n) && n > 0 ? n : 0;
  const wants = winners.map(function (id) {
    if (mode === "all" || mode === "big-pot") return display[id];
    return Math.min(nSafe, display[id]);
  });
  let totalWant = 0;
  wants.forEach(function (w) {
    totalWant += w;
  });
  totalWant = core.round1(totalWant);
  if (!(totalWant > 0)) {
    return { display: display, donated: donated, remaining: rem };
  }
  const take = rem === Infinity ? totalWant : Math.min(totalWant, rem);
  let allocated = 0;
  winners.forEach(function (id, i) {
    let give;
    if (i === winners.length - 1) {
      give = core.round1(take - allocated);
    } else {
      give = core.round1(take * (wants[i] / totalWant));
      allocated += give;
    }
    if (give < 0) give = 0;
    if (give > display[id]) give = display[id];
    donated[id] = give;
    display[id] = core.round1(display[id] - give);
  });
  if (rem !== Infinity) {
    rem = core.round1(rem - take);
    if (rem < 0) rem = 0;
  }
  return { display: display, donated: donated, remaining: rem };
}

function bigPotMoney(totalsRaw, inPot, fundS) {
  const fund = isFinite(Number(fundS)) && Number(fundS) > 0 ? core.round1(Number(fundS)) : 0;
  const idxs = [];
  (inPot || []).forEach(function (on, i) {
    if (on) idxs.push(i);
  });
  const n = idxs.length;
  const out = (totalsRaw || []).map(function () {
    return null;
  });
  if (!n) return out;
  let sumPts = 0;
  idxs.forEach(function (i) {
    sumPts += Number(totalsRaw[i]) || 0;
  });
  sumPts = core.round1(sumPts);
  const pool = Math.abs(sumPts);
  const target = core.round1(-fund);
  let acc = 0;
  idxs.forEach(function (i, k) {
    let v;
    if (k === n - 1) {
      v = core.round1(target - acc);
    } else if (!pool) {
      v = core.round1(-fund / n);
      acc = core.round1(acc + v);
    } else {
      v = core.round1((Number(totalsRaw[i]) || 0) * fund / pool);
      acc = core.round1(acc + v);
    }
    out[i] = v;
  });
  return out;
}

module.exports = {
  applyHolePot,
  bigPotMoney
};
