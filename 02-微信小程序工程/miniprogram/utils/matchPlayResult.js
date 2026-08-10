/**
 * G5–G8 比洞结果展示（仅展示层）。
 * 业余赛可继续记满 18 洞：不中止记分、不改 scoreData、不改比赛状态。
 * 提前结束文案：首次「领先洞数 > 剩余洞数」且剩余 > 0 → n&m（如 5&4）。
 * 打满 18 洞（剩余 0）：→ nUP / nDN，禁止 n&0。
 */

function isFilledScore(raw) {
  return raw !== null && raw !== undefined && raw !== '';
}

function normalizeStartHole(startHole) {
  const n = Number(startHole);
  if (!Number.isFinite(n)) return 1;
  const h = Math.floor(n);
  return h >= 1 && h <= 18 ? h : 1;
}

/** 比赛序洞索引 0–17（从 startHole 环绕） */
function buildMatchPlayHoleOrderIndexes(startHole) {
  const start = normalizeStartHole(startHole);
  const order = [];
  for (let i = 0; i < 18; i++) {
    order.push((start - 1 + i) % 18);
  }
  return order;
}

/**
 * 统一比洞结果摘要：供记分页 TOTAL / 详情得分榜卡片共用。
 * @param {Array} scoresA Side A 18 洞成绩（洞号索引）
 * @param {Array} scoresB Side B 18 洞成绩
 * @param {number} [startHole=1]
 * @returns {{
 *   leader: 'A'|'B'|'AS',
 *   up: number,
 *   remaining: number,
 *   thru: number,
 *   clinched: boolean,
 *   statusMain: string,
 *   statusSub: string,
 *   label: string
 * }}
 */
function buildMatchPlayResultSummary(scoresA, scoresB, startHole) {
  const a = Array.isArray(scoresA) ? scoresA : [];
  const b = Array.isArray(scoresB) ? scoresB : [];
  const order = buildMatchPlayHoleOrderIndexes(startHole);
  let aWins = 0;
  let bWins = 0;
  let thru = 0;
  let clinch = null;

  for (let oi = 0; oi < order.length; oi++) {
    const hi = order[oi];
    const rawA = a[hi];
    const rawB = b[hi];
    if (!isFilledScore(rawA) || !isFilledScore(rawB)) continue;
    const sa = Number(rawA);
    const sb = Number(rawB);
    if (!Number.isFinite(sa) || !Number.isFinite(sb)) continue;
    thru += 1;
    if (sa < sb) aWins += 1;
    else if (sb < sa) bWins += 1;

    const diff = aWins - bWins;
    const lead = Math.abs(diff);
    const remaining = 18 - thru;
    // 首次数学结束：领先 > 剩余（可继续记分，结果按该点冻结）
    if (!clinch && lead > 0 && lead > remaining) {
      clinch = {
        leader: diff > 0 ? 'A' : 'B',
        up: lead,
        remaining: remaining
      };
    }
  }

  if (clinch) {
    // 展示层：剩余 0 洞时禁止 n&0，改用 nUP / nDN（不改 clinch 判定本身）
    if (clinch.remaining <= 0) {
      const suffix = clinch.leader === 'B' ? 'DN' : 'UP';
      return {
        leader: clinch.leader,
        up: clinch.up,
        remaining: clinch.remaining,
        thru: thru,
        clinched: true,
        statusMain: String(clinch.up),
        statusSub: suffix,
        label: clinch.up + suffix
      };
    }
    return {
      leader: clinch.leader,
      up: clinch.up,
      remaining: clinch.remaining,
      thru: thru,
      clinched: true,
      statusMain: String(clinch.up),
      statusSub: '&' + clinch.remaining,
      label: clinch.up + '&' + clinch.remaining
    };
  }

  const diff = aWins - bWins;
  const remaining = 18 - thru;
  if (thru === 0 || diff === 0) {
    return {
      leader: 'AS',
      up: 0,
      remaining: remaining,
      thru: thru,
      clinched: false,
      statusMain: 'TIED',
      statusSub: '',
      label: 'TIED'
    };
  }
  if (diff > 0) {
    return {
      leader: 'A',
      up: diff,
      remaining: remaining,
      thru: thru,
      clinched: false,
      statusMain: String(diff),
      statusSub: 'UP',
      label: diff + 'UP'
    };
  }
  return {
    leader: 'B',
    up: -diff,
    remaining: remaining,
    thru: thru,
    clinched: false,
    statusMain: String(-diff),
    statusSub: 'DN',
    label: -diff + 'DN'
  };
}

/**
 * 比洞得分榜卡片底部 18 洞圆点（与 tournament detail holeDots 同规则）。
 * - 洞号 n = 比赛序 1–18（从 startHole 环绕）
 * - 颜色按该 Match Hole 对应 actualHole 双方 side 成绩比较（A 红 / B 蓝 / AS 平）
 * - 未双方录入保持 empty；不另建总杆推断算法
 * @returns {Array<{ n: number, actualHole: number, result: string, cls: string }>}
 */
function buildMatchPlayHoleDots(scoresA, scoresB, startHole) {
  const a = Array.isArray(scoresA) ? scoresA : [];
  const b = Array.isArray(scoresB) ? scoresB : [];
  const order = buildMatchPlayHoleOrderIndexes(startHole);
  const holeDots = [];
  for (let ci = 0; ci < order.length; ci++) {
    const hi = order[ci];
    const actualHole = hi + 1;
    let holeResult = '';
    let dotCls = 'empty';
    if (isFilledScore(a[hi]) && isFilledScore(b[hi])) {
      const sa = Number(a[hi]);
      const sb = Number(b[hi]);
      if (Number.isFinite(sa) && Number.isFinite(sb)) {
        if (sa < sb) {
          holeResult = 'A';
          dotCls = 'mp-sb-dot--a';
        } else if (sb < sa) {
          holeResult = 'B';
          dotCls = 'mp-sb-dot--b';
        } else {
          holeResult = 'AS';
          dotCls = 'mp-sb-dot--as';
        }
      }
    }
    holeDots.push({
      n: ci + 1,
      actualHole: actualHole,
      result: holeResult,
      cls: dotCls
    });
  }
  return holeDots;
}

module.exports = {
  buildMatchPlayResultSummary: buildMatchPlayResultSummary,
  normalizeStartHole: normalizeStartHole,
  buildMatchPlayHoleOrderIndexes: buildMatchPlayHoleOrderIndexes,
  buildMatchPlayHoleDots: buildMatchPlayHoleDots,
  isFilledScore: isFilledScore
};
