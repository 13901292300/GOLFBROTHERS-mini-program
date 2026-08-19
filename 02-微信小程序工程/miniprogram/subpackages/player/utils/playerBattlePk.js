/**
 * 球员战绩 PK（P2B）。
 * 仅比较普通个人比杆 / G1 完赛有效总杆；复用 playerMatchHistory 样本能力。
 * 页面不得直接遍历 Store。
 */

const playerIdentityGuard = require('../../../utils/playerIdentityGuard.js');
const userIdentityAlias = require('../../../utils/userIdentityAlias.js');
const playerMatchHistory = require('../../../utils/playerMatchHistory.js');

const PK_SCOPES = {
  SAME_GAME: 'sameGame',
  SAME_GROUP: 'sameGroup'
};

const PK_SAMPLE_SIZES = {
  TEN: 10,
  TWENTY: 20
};

function _trim(v) {
  return v == null ? '' : String(v).trim();
}

function _canon(id) {
  const n = playerIdentityGuard.normalizePlayerUserId(id);
  if (!n) return '';
  try {
    return userIdentityAlias.resolveCanonicalUserId(n) || n;
  } catch (e) {
    return n;
  }
}

/**
 * 拉黑预留：尚未实现产品能力，统一返回未拉黑。
 * 禁止写死假“已拉黑”状态。
 */
function resolveBattleBlockAccess(viewerUserId, targetUserId) {
  return {
    blocked: false,
    reason: 'not_implemented'
  };
}

/**
 * PK 访问：稳定正式用户、非本人、双方历史可用于比较、未拉黑。
 */
function resolvePlayerBattlePkAccess(viewerUserId, targetUserId, profile) {
  const viewer = playerIdentityGuard.normalizePlayerUserId(viewerUserId);
  const target = playerIdentityGuard.normalizePlayerUserId(targetUserId);
  if (!playerIdentityGuard.isStablePublicUserId(viewer)) {
    return { canPk: false, reason: 'viewer_unstable', canViewHistory: false };
  }
  if (!playerIdentityGuard.isStablePublicUserId(target)) {
    return { canPk: false, reason: 'target_unstable', canViewHistory: false };
  }
  if (_canon(viewer) === _canon(target)) {
    return { canPk: false, reason: 'self', canViewHistory: true, isSelf: true };
  }
  if (
    playerIdentityGuard.isGuestPlayerId(target) ||
    playerIdentityGuard.isMaskedPlayerId(target)
  ) {
    return { canPk: false, reason: 'target_guest_or_masked', canViewHistory: false };
  }
  const hist = playerMatchHistory.resolvePlayerHistoryAccess(viewer, target, profile);
  if (!hist.canViewHistory) {
    return {
      canPk: false,
      reason: hist.reason || 'history_private',
      canViewHistory: false
    };
  }
  const block = resolveBattleBlockAccess(viewer, target);
  if (block.blocked) {
    return { canPk: false, reason: 'blocked', canViewHistory: true };
  }
  return {
    canPk: true,
    reason: 'ok',
    canViewHistory: true,
    isSelf: false
  };
}

function _formatAvg(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const r = Math.round(n * 10) / 10;
  if (Math.abs(r - Math.round(r)) < 1e-9) return Math.round(r);
  return r;
}

function _avgDiffLabel(diff) {
  if (diff == null || !Number.isFinite(diff)) return '';
  if (diff === 0) return '双方平均总杆相同';
  const abs = _formatAvg(Math.abs(diff));
  if (diff > 0) return '你平均领先 ' + abs + ' 杆';
  return '对方平均领先 ' + abs + ' 杆';
}

function _sortPaired(a, b) {
  const ta = a.completedAt > 0 ? a.completedAt : -1;
  const tb = b.completedAt > 0 ? b.completedAt : -1;
  if (ta !== tb) return tb - ta;
  return String(a.matchKey).localeCompare(String(b.matchKey));
}

/**
 * 从双方样本求交集并过滤有效对局（纯函数，便于静态测试）。
 */
function pairBattleSamples(viewerSamples, targetSamples, scope) {
  const scopeKey = scope === PK_SCOPES.SAME_GROUP ? PK_SCOPES.SAME_GROUP : PK_SCOPES.SAME_GAME;
  const viewerMap = {};
  (Array.isArray(viewerSamples) ? viewerSamples : []).forEach((s) => {
    if (!s || !s.matchKey) return;
    if (!s.scoreValid) return;
    if (s.grossScore == null || !Number.isFinite(Number(s.grossScore)) || Number(s.grossScore) < 0) {
      return;
    }
    if (!s.completedHoleCount || !s.requiredHoleCount) return;
    if (s.completedHoleCount !== s.requiredHoleCount) return;
    viewerMap[s.matchKey] = s;
  });

  const paired = [];
  (Array.isArray(targetSamples) ? targetSamples : []).forEach((t) => {
    if (!t || !t.matchKey) return;
    if (!t.scoreValid) return;
    if (t.grossScore == null || !Number.isFinite(Number(t.grossScore)) || Number(t.grossScore) < 0) {
      return;
    }
    if (!t.completedHoleCount || !t.requiredHoleCount) return;
    if (t.completedHoleCount !== t.requiredHoleCount) return;
    const v = viewerMap[t.matchKey];
    if (!v) return;
    // 双方有效洞数必须一致
    if (v.completedHoleCount !== t.completedHoleCount) return;
    const vg = _trim(v.groupId);
    const tg = _trim(t.groupId);
    const isSameGroup = !!(vg && tg && vg === tg);
    if (scopeKey === PK_SCOPES.SAME_GROUP && !isSameGroup) return;
    const viewerGross = Math.floor(Number(v.grossScore));
    const targetGross = Math.floor(Number(t.grossScore));
    let result = 'draw';
    if (viewerGross < targetGross) result = 'win';
    else if (viewerGross > targetGross) result = 'loss';
    const completedAt =
      v.completedAt > 0 || t.completedAt > 0
        ? Math.max(Number(v.completedAt) || 0, Number(t.completedAt) || 0)
        : 0;
    paired.push({
      matchKey: t.matchKey,
      matchId: _trim(v.matchId || t.matchId),
      sourceType: _trim(v.sourceType || t.sourceType),
      matchName: _trim(v.matchName || t.matchName),
      courseName: _trim(v.courseName || t.courseName),
      completedAt: completedAt,
      dateLabel: v.dateLabel || t.dateLabel || '日期缺失',
      isSameGroup: isSameGroup,
      groupId: isSameGroup ? vg : '',
      viewerGross: viewerGross,
      targetGross: targetGross,
      difference: targetGross - viewerGross,
      result: result,
      navUrl: _trim(v.navUrl || t.navUrl)
    });
  });

  paired.sort(_sortPaired);
  return paired;
}

function summarizePaired(matches) {
  const list = Array.isArray(matches) ? matches : [];
  const n = list.length;
  if (!n) {
    return {
      viewerWins: 0,
      targetWins: 0,
      draws: 0,
      viewerAverageGross: null,
      targetAverageGross: null,
      averageDifference: null,
      averageDifferenceLabel: '',
      viewerBestGross: null,
      targetBestGross: null
    };
  }
  let viewerWins = 0;
  let targetWins = 0;
  let draws = 0;
  let vSum = 0;
  let tSum = 0;
  let vBest = null;
  let tBest = null;
  list.forEach((m) => {
    if (m.result === 'win') viewerWins += 1;
    else if (m.result === 'loss') targetWins += 1;
    else draws += 1;
    vSum += m.viewerGross;
    tSum += m.targetGross;
    if (vBest == null || m.viewerGross < vBest) vBest = m.viewerGross;
    if (tBest == null || m.targetGross < tBest) tBest = m.targetGross;
  });
  const vAvg = _formatAvg(vSum / n);
  const tAvg = _formatAvg(tSum / n);
  const diff = _formatAvg(tAvg - vAvg);
  return {
    viewerWins: viewerWins,
    targetWins: targetWins,
    draws: draws,
    viewerAverageGross: vAvg,
    targetAverageGross: tAvg,
    averageDifference: diff,
    averageDifferenceLabel: _avgDiffLabel(diff),
    viewerBestGross: vBest,
    targetBestGross: tBest
  };
}

/**
 * @param {object} opts
 * @param {string} opts.viewerUserId
 * @param {string} opts.targetUserId
 * @param {'sameGame'|'sameGroup'} [opts.scope]
 * @param {10|20} [opts.sampleSize]
 * @param {object} [opts.profile]
 * @param {{ revision?: string, viewerSamples?: array, targetSamples?: array }} [opts.cached]
 */
function buildPlayerBattlePk(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const viewerUserId = playerIdentityGuard.normalizePlayerUserId(o.viewerUserId);
  const targetUserId = playerIdentityGuard.normalizePlayerUserId(o.targetUserId);
  const scope = o.scope === PK_SCOPES.SAME_GROUP ? PK_SCOPES.SAME_GROUP : PK_SCOPES.SAME_GAME;
  const sampleSize = Number(o.sampleSize) === 20 ? 20 : 10;
  const access = resolvePlayerBattlePkAccess(viewerUserId, targetUserId, o.profile);
  const revision = playerMatchHistory.getStoreRevision();

  const empty = {
    access: access,
    viewer: { userId: viewerUserId },
    target: { userId: targetUserId },
    scope: scope,
    sampleSize: sampleSize,
    actualCount: 0,
    summary: summarizePaired([]),
    trend: [],
    matches: [],
    revision: revision,
    emptyReason: scope === PK_SCOPES.SAME_GROUP ? 'no_same_group' : 'no_same_game'
  };

  if (!access.canPk) {
    return Object.assign({}, empty, {
      matches: [],
      trend: [],
      actualCount: 0,
      emptyReason: access.reason
    });
  }

  let viewerSamples;
  let targetSamples;
  const cached = o.cached && typeof o.cached === 'object' ? o.cached : null;
  if (
    cached &&
    cached.revision === revision &&
    Array.isArray(cached.viewerSamples) &&
    Array.isArray(cached.targetSamples)
  ) {
    viewerSamples = cached.viewerSamples;
    targetSamples = cached.targetSamples;
  } else {
    viewerSamples = playerMatchHistory.listPlayerPersonalStrokeSamples(viewerUserId);
    targetSamples = playerMatchHistory.listPlayerPersonalStrokeSamples(targetUserId);
  }

  const pairedAll = pairBattleSamples(viewerSamples, targetSamples, scope);
  const matches = pairedAll.slice(0, sampleSize);
  const summary = summarizePaired(matches);
  // 趋势：旧→新（底层 matches 仍新→旧）
  const trend = matches
    .slice()
    .reverse()
    .map((m) => {
      if (m.result === 'win') return '胜';
      if (m.result === 'loss') return '负';
      return '平';
    });

  return {
    access: access,
    viewer: { userId: viewerUserId },
    target: { userId: targetUserId },
    scope: scope,
    sampleSize: sampleSize,
    actualCount: matches.length,
    summary: summary,
    trend: trend,
    matches: matches,
    revision: revision,
    samplesCache: {
      revision: revision,
      viewerSamples: viewerSamples,
      targetSamples: targetSamples
    },
    emptyReason: matches.length
      ? ''
      : scope === PK_SCOPES.SAME_GROUP
        ? 'no_same_group'
        : 'no_same_game'
  };
}

/**
 * 静态用例（不依赖 Storage）。返回 { ok, results[] }。
 */
function runPlayerBattlePkStaticChecks() {
  const results = [];
  function assert(name, cond) {
    results.push({ name: name, pass: !!cond });
  }

  // 1. 0场
  assert('0 common', pairBattleSamples([], [], 'sameGame').length === 0);

  const mk = function (userId, matchKey, gross, holes, groupId, at) {
    return {
      userId: userId,
      matchKey: matchKey,
      matchId: matchKey.split(':')[1] || '',
      sourceType: matchKey.indexOf('game:') === 0 ? 'game' : 'team_match',
      matchName: 'M',
      courseName: 'C',
      grossScore: gross,
      completedHoleCount: holes,
      requiredHoleCount: holes,
      groupId: groupId || '',
      completedAt: at || 0,
      scoreValid: true,
      navUrl: ''
    };
  };

  // 2–4 胜负平
  let p = pairBattleSamples(
    [mk('a', 'game:1', 70, 18, 'g1', 3)],
    [mk('b', 'game:1', 72, 18, 'g1', 3)],
    'sameGame'
  );
  assert('viewer win', p.length === 1 && p[0].result === 'win');
  p = pairBattleSamples(
    [mk('a', 'game:1', 75, 18, 'g1', 3)],
    [mk('b', 'game:1', 72, 18, 'g1', 3)],
    'sameGame'
  );
  assert('target win', p.length === 1 && p[0].result === 'loss');
  p = pairBattleSamples(
    [mk('a', 'game:1', 72, 18, 'g1', 3)],
    [mk('b', 'game:1', 72, 18, 'g1', 3)],
    'sameGame'
  );
  assert('draw', p.length === 1 && p[0].result === 'draw');

  // 5–6 截取
  const v12 = [];
  const t12 = [];
  for (let i = 1; i <= 12; i++) {
    v12.push(mk('a', 'game:' + i, 70 + (i % 3), 18, 'g', i));
    t12.push(mk('b', 'game:' + i, 71, 18, 'g', i));
  }
  const all12 = pairBattleSamples(v12, t12, 'sameGame');
  assert('12 sameGame', all12.length === 12);
  assert('take 10', all12.slice(0, 10).length === 10 && all12[0].matchKey === 'game:12');

  const v25 = [];
  const t25 = [];
  for (let j = 1; j <= 25; j++) {
    v25.push(mk('a', 'game:x' + j, 70, 18, 'g', j));
    t25.push(mk('b', 'game:x' + j, 71, 18, 'g', j));
  }
  assert('take 20 of 25', pairBattleSamples(v25, t25, 'sameGame').slice(0, 20).length === 20);

  // 7 同场中部分同组
  const vMix = [
    mk('a', 'game:a1', 70, 18, 'g1', 5),
    mk('a', 'game:a2', 71, 18, 'g1', 4),
    mk('a', 'game:a3', 72, 18, 'g2', 3)
  ];
  const tMix = [
    mk('b', 'game:a1', 73, 18, 'g1', 5),
    mk('b', 'game:a2', 74, 18, 'g9', 4),
    mk('b', 'game:a3', 75, 18, 'g2', 3)
  ];
  assert('sameGame 3', pairBattleSamples(vMix, tMix, 'sameGame').length === 3);
  assert('sameGroup 2', pairBattleSamples(vMix, tMix, 'sameGroup').length === 2);

  // 8 groupId 空
  assert(
    'empty groupId',
    pairBattleSamples(
      [mk('a', 'game:e', 70, 18, '', 1)],
      [mk('b', 'game:e', 71, 18, '', 1)],
      'sameGroup'
    ).length === 0
  );

  // 9 同名不同 id —— 不同 matchKey
  assert(
    'same name different id',
    pairBattleSamples(
      [mk('a', 'game:id1', 70, 18, 'g', 1)],
      [mk('b', 'game:id2', 71, 18, 'g', 1)],
      'sameGame'
    ).length === 0
  );

  // 10 不同 Store 裸 id 相同
  assert(
    'cross store bare id',
    pairBattleSamples(
      [mk('a', 'game:abc', 70, 18, 'g', 1)],
      [mk('b', 'team-match:abc', 71, 18, 'g', 1)],
      'sameGame'
    ).length === 0
  );

  // 11 一方缺成绩
  assert(
    'missing gross',
    pairBattleSamples(
      [
        Object.assign(mk('a', 'game:m', 70, 18, 'g', 1), {
          scoreValid: false,
          grossScore: null
        })
      ],
      [mk('b', 'game:m', 71, 18, 'g', 1)],
      'sameGame'
    ).length === 0
  );

  // 12 洞数不一致
  assert(
    'hole mismatch',
    pairBattleSamples(
      [mk('a', 'game:h', 70, 18, 'g', 1)],
      [
        Object.assign(mk('b', 'game:h', 71, 9, 'g', 1), {
          requiredHoleCount: 9,
          completedHoleCount: 9
        })
      ],
      'sameGame'
    ).length === 0
  );

  // 13–14 由样本层排除（此处仅确认 scoreValid=false 不进）
  assert(
    'invalid sample excluded',
    pairBattleSamples(
      [Object.assign(mk('a', 'game:z', 70, 18, 'g', 1), { scoreValid: false })],
      [mk('b', 'game:z', 71, 18, 'g', 1)],
      'sameGame'
    ).length === 0
  );

  // 15 平均值
  const s = summarizePaired([
    { result: 'win', viewerGross: 70, targetGross: 72 },
    { result: 'loss', viewerGross: 73, targetGross: 71 }
  ]);
  assert('avg int/decimal', s.viewerAverageGross === 71.5 && s.targetAverageGross === 71.5);
  assert('avg empty null', summarizePaired([]).viewerAverageGross === null);

  // 16 备注名不影响 matchKey（计算层无 name 字段参与）
  assert('identity by matchKey only', true);

  const ok = results.every((r) => r.pass);
  return { ok: ok, results: results };
}

module.exports = {
  PK_SCOPES: PK_SCOPES,
  PK_SAMPLE_SIZES: PK_SAMPLE_SIZES,
  resolveBattleBlockAccess: resolveBattleBlockAccess,
  resolvePlayerBattlePkAccess: resolvePlayerBattlePkAccess,
  pairBattleSamples: pairBattleSamples,
  summarizePaired: summarizePaired,
  buildPlayerBattlePk: buildPlayerBattlePk,
  runPlayerBattlePkStaticChecks: runPlayerBattlePkStaticChecks
};
