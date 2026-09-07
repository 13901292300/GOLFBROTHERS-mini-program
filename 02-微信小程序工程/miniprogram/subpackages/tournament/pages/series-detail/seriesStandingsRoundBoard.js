/**
 * Series 单轮非球队榜投影（个人 / 组合 / 配对）
 * - 纯函数；不写 storage；不改 TOT
 * - L2：消费普通权威 selection { view: team|all|male|female, scoreType: gross|net }
 * - entity/pair 使用 teamScoresByEntity / scoreEntities，不拆成假个人成绩
 * - 净杆只读 match.peoriaResult（与 detail 一致）；未知性别不归入男/女
 */

var standingsViewOptions = require('./seriesStandingsViewOptions.js');
var standingsViewModel = require('./seriesStandingsViewModel.js');
var comboDisplayName = require('../../../../utils/comboDisplayName.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function formatDash() {
  return '-';
}

function formatToParDiff(diff) {
  return standingsViewModel.formatToParDiff(diff);
}

function resolveToParScoreClass(diff) {
  return standingsViewModel.resolveToParScoreClass(diff);
}

function isStationStarted(match) {
  var st = asString(match && match.status).toLowerCase();
  return st === 'ongoing' || st === 'finished' || st === 'completed';
}

function emptyStatusLabel(match, hasUnit) {
  if (!hasUnit) return '暂无阵容';
  if (!isStationStarted(match)) return 'TEEING OFF SOON';
  return 'AWAITING SCORE';
}

function memberNameJoin(members) {
  return comboDisplayName.joinMemberDisplayNames(members);
}

function readEntityScore(rec) {
  var scores = rec && Array.isArray(rec.scores) ? rec.scores : [];
  var thru = 0;
  var gross = 0;
  var toPar = null;
  if (rec && rec.toPar != null && rec.toPar !== '' && Number.isFinite(Number(rec.toPar))) {
    toPar = Number(rec.toPar);
  } else if (rec && rec.diff != null && rec.diff !== '' && Number.isFinite(Number(rec.diff))) {
    toPar = Number(rec.diff);
  }
  for (var i = 0; i < scores.length && i < 18; i++) {
    var s = scores[i];
    if (s == null || s === '') continue;
    var n = Number(s);
    if (!Number.isFinite(n)) continue;
    thru += 1;
    gross += n;
  }
  if (rec && rec.grossTotal != null && Number.isFinite(Number(rec.grossTotal))) {
    gross = Number(rec.grossTotal);
  }
  var hasScore = thru > 0 || (toPar != null && Number.isFinite(toPar));
  return {
    hasScore: hasScore,
    thru: thru > 0 ? String(thru) : formatDash(),
    toPar: hasScore ? toPar : null,
    grossTotal: hasScore && Number.isFinite(gross) ? gross : null
  };
}

function buildPlayerLookup(match) {
  var map = Object.create(null);
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var players = groups[g] && Array.isArray(groups[g].players) ? groups[g].players : [];
    for (var p = 0; p < players.length; p++) {
      var pl = players[p];
      if (!pl) continue;
      var id = asString(pl.userId || pl.playerId || pl.id);
      if (!id) continue;
      map[id] = pl;
    }
  }
  return map;
}

function normalizeGender(raw) {
  var g = asString(raw).toLowerCase();
  if (g === 'male' || g === 'm' || g === '男' || g === '男子') return 'male';
  if (g === 'female' || g === 'f' || g === '女' || g === '女子') return 'female';
  return '';
}

function resolvePlayerDisplay(pl, id) {
  var name =
    asString(pl && (pl.competitionName || pl.matchNickname || pl.nickname || pl.name)) ||
    id ||
    '球员';
  return {
    playerId: id,
    userId: id,
    name: name,
    displayName: name,
    avatar: asString(pl && pl.avatar),
    gender: normalizeGender(pl && pl.gender),
    genderIcon: asString(pl && (pl.genderIcon || pl.genderSymbol)),
    genderClass: asString(pl && pl.genderClass)
  };
}

function indexPeoriaNetByPlayer(match) {
  var map = Object.create(null);
  var results =
    match &&
    match.peoriaResult &&
    Array.isArray(match.peoriaResult.results)
      ? match.peoriaResult.results
      : [];
  for (var i = 0; i < results.length; i++) {
    var item = results[i];
    if (!item || item.playerId == null) continue;
    var id = asString(item.playerId);
    if (id) map[id] = item;
  }
  return map;
}

function filterRowsByGenderView(rows, view) {
  var list = Array.isArray(rows) ? rows : [];
  if (view !== 'male' && view !== 'female') return list.slice();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row) continue;
    // 与 detail 一致：严格 row.gender ===；未知性别不归入
    if (row.gender === view) out.push(row);
  }
  return out;
}

/**
 * 从 scoreEntities 构建组合/配对行
 */
function buildEntityOrPairRows(match, wantPair) {
  var scoreEntities =
    match && match.scoreEntities && typeof match.scoreEntities === 'object'
      ? match.scoreEntities
      : {};
  var scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' ? match.scoreData : {};
  var lookup = buildPlayerLookup(match);
  var rows = [];
  var keys = Object.keys(scoreEntities);
  for (var k = 0; k < keys.length; k++) {
    var groupId = keys[k];
    var entities = Array.isArray(scoreEntities[groupId]) ? scoreEntities[groupId] : [];
    var bucket =
      scoreData[groupId] && typeof scoreData[groupId] === 'object' ? scoreData[groupId] : {};
    var byEntity = Object.create(null);
    var list = Array.isArray(bucket.teamScoresByEntity) ? bucket.teamScoresByEntity : [];
    for (var t = 0; t < list.length; t++) {
      var rec = list[t];
      if (!rec) continue;
      var ek = asString(rec.teamId || rec.entityId);
      if (ek) byEntity[ek] = rec;
    }
    for (var e = 0; e < entities.length; e++) {
      var entity = entities[e];
      if (!entity) continue;
      var entityId = asString(entity.entityId);
      if (!entityId) continue;
      var entityType = asString(entity.entityType);
      var compositionMode = asString(entity.compositionMode);
      var isPair =
        entityType === 'pair' || compositionMode === '2+2' || wantPair === true;
      if (wantPair && !isPair && entityType && entityType !== 'pair') continue;
      if (!wantPair && isPair && entityType === 'pair') {
        /* G2/G3 也可能 2+2，仍作组合展示 */
      }
      var rawMembers = Array.isArray(entity.members) ? entity.members : [];
      var members = [];
      for (var m = 0; m < rawMembers.length; m++) {
        var mid = '';
        var mm = rawMembers[m];
        if (mm == null) continue;
        if (typeof mm === 'string' || typeof mm === 'number') mid = asString(mm);
        else mid = asString(mm.userId || mm.playerId || mm.id);
        if (!mid) continue;
        members.push(resolvePlayerDisplay(lookup[mid], mid));
      }
      if (!members.length) continue;
      var name = memberNameJoin(members);
      if (!name) continue;
      var scored = readEntityScore(byEntity[entityId] || {});
      var statusLabel = '';
      if (!scored.hasScore) statusLabel = emptyStatusLabel(match, true);
      rows.push({
        rowId: entityId,
        scorecardKey: 'entity:' + entityId,
        pos: scored.hasScore ? '' : formatDash(),
        name: name,
        thru: scored.hasScore ? scored.thru : formatDash(),
        scoreStr: scored.hasScore ? formatToParDiff(scored.toPar) : formatDash(),
        scoreClass: scored.hasScore
          ? resolveToParScoreClass(scored.toPar)
          : 'score-even',
        hasScore: scored.hasScore,
        statusLabel: statusLabel,
        resultUnitType: wantPair ? 'pair' : 'entity',
        entityId: entityId,
        playerId: '',
        isEntity: true,
        members: members,
        groupId: asString(groupId),
        matchId: asString(match && match.matchId),
        canOpenScorecard: true
      });
    }
  }
  return rankRows(rows);
}

function readPlayerHoleScore(match, playerId) {
  var scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' ? match.scoreData : {};
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var gid = asString(groups[g] && groups[g].groupId);
    var bucket = scoreData[gid] && typeof scoreData[gid] === 'object' ? scoreData[gid] : null;
    if (!bucket) continue;
    var byPlayer =
      bucket.scoresByPlayer && typeof bucket.scoresByPlayer === 'object'
        ? bucket.scoresByPlayer
        : null;
    var rec = byPlayer && byPlayer[playerId] ? byPlayer[playerId] : null;
    if (!rec && Array.isArray(bucket.teamScoresByPlayer)) {
      for (var i = 0; i < bucket.teamScoresByPlayer.length; i++) {
        var r = bucket.teamScoresByPlayer[i];
        if (r && asString(r.playerId || r.userId || r.teamId) === playerId) {
          rec = r;
          break;
        }
      }
    }
    if (!rec) continue;
    return readEntityScore(rec);
  }
  return { hasScore: false, thru: formatDash(), toPar: null, grossTotal: null };
}

function buildPlayerRows(match, scoreType) {
  var lookup = buildPlayerLookup(match);
  var ids = Object.keys(lookup);
  var wantNet = asString(scoreType) === 'net';
  var peoriaById = wantNet ? indexPeoriaNetByPlayer(match) : Object.create(null);
  var rows = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var disp = resolvePlayerDisplay(lookup[id], id);
    var scored = readPlayerHoleScore(match, id);
    var thruNum = scored.hasScore ? Number(scored.thru) : 0;
    if (!Number.isFinite(thruNum)) thruNum = 0;
    var statusLabel = '';
    var scoreStr = formatDash();
    var scoreClass = 'score-even';
    var hasScore = false;
    var netVal = null;
    if (wantNet) {
      var peoria = peoriaById[id] || null;
      var netRaw = peoria && peoria.net != null ? Number(peoria.net) : NaN;
      var hasNetScore = thruNum === 18 && Number.isFinite(netRaw);
      hasScore = hasNetScore;
      netVal = hasNetScore ? netRaw : null;
      scoreStr = hasNetScore ? String(netRaw) : formatDash();
      scoreClass = 'score-even';
      if (!hasNetScore) statusLabel = emptyStatusLabel(match, true);
    } else {
      hasScore = !!scored.hasScore;
      scoreStr = hasScore ? formatToParDiff(scored.toPar) : formatDash();
      scoreClass = hasScore ? resolveToParScoreClass(scored.toPar) : 'score-even';
      if (!hasScore) statusLabel = emptyStatusLabel(match, true);
    }
    rows.push({
      rowId: id,
      scorecardKey: 'player:' + id,
      pos: hasScore ? '' : formatDash(),
      name: disp.name,
      thru: scored.hasScore ? scored.thru : formatDash(),
      scoreStr: scoreStr,
      scoreClass: scoreClass,
      hasScore: hasScore,
      toParValue: wantNet ? netVal : scored.toPar,
      net: netVal,
      statusLabel: statusLabel,
      resultUnitType: 'player',
      entityId: '',
      playerId: id,
      userId: id,
      isEntity: false,
      members: [],
      avatar: disp.avatar,
      gender: disp.gender,
      genderIcon: disp.genderIcon,
      genderClass: disp.genderClass,
      matchId: asString(match && match.matchId),
      canOpenScorecard: !wantNet,
      scoreType: wantNet ? 'net' : 'gross'
    });
  }
  return rankRows(rows);
}

function rankRows(rows) {
  var list = Array.isArray(rows) ? rows.slice() : [];
  var withScore = [];
  var without = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].hasScore) withScore.push(list[i]);
    else without.push(list[i]);
  }
  withScore.sort(function (a, b) {
    var av = a.toParValue != null ? a.toParValue : Number(a.scoreStr);
    var bv = b.toParValue != null ? b.toParValue : Number(b.scoreStr);
    // scoreStr 已格式化；改用原始：重新解析
    return 0;
  });
  // 用 scoreClass/toPar 不可靠；按 thru 已有 hasScore 的顺序保持稳定，再赋 POS
  withScore.sort(function (a, b) {
    var as = parseToParNumber(a.scoreStr);
    var bs = parseToParNumber(b.scoreStr);
    if (as == null && bs == null) return 0;
    if (as == null) return 1;
    if (bs == null) return -1;
    return as - bs;
  });
  for (var r = 0; r < withScore.length; r++) {
    withScore[r] = Object.assign({}, withScore[r], { pos: String(r + 1) });
  }
  for (var w = 0; w < without.length; w++) {
    without[w] = Object.assign({}, without[w], { pos: formatDash() });
  }
  return withScore.concat(without);
}

function parseToParNumber(str) {
  var s = asString(str);
  if (!s || s === '-') return null;
  if (s.charAt(0) === '+') s = s.slice(1);
  var n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} input
 * @param {object} input.match
 * @param {string|object} [input.view] 权威 view 或旧 unit；也可用 input.selection
 * @param {string} [input.scoreType] gross|net
 * @param {object} [input.selection] { view, scoreType }
 * @param {string} [input.roundId]
 * @param {string} [input.roundHeadline]
 */
function buildSeriesRoundBoardViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var match = src.match && typeof src.match === 'object' ? src.match : null;
  var rawSel = src.selection || { view: src.view, scoreType: src.scoreType };
  // 显式 team：Series R/TOT 球队板不因 match.teamGroups 不足被 normalize 掉
  var explicitTeam =
    asString(rawSel && rawSel.view) === 'team' || asString(src.view) === 'team';
  var selection = standingsViewOptions.normalizeSeriesStandingsSelection(
    match,
    rawSel
  );
  if (explicitTeam) {
    selection = { view: 'team', scoreType: selection.scoreType || 'gross' };
  }
  var view = selection.view;
  var scoreType = selection.scoreType;

  if (view === 'team' || !match) {
    return {
      boardView: 'team',
      selection: selection,
      showTeamBoard: true,
      listRows: [],
      listEmptyText: '',
      leaderboardViewLabel: standingsViewOptions.boardViewLabel(
        'team',
        scoreType,
        match
      ),
      headPlayerLabel: 'TEAM',
      roundId: asString(src.roundId),
      roundHeadline: asString(src.roundHeadline)
    };
  }

  var legacyUnit = asString(src.view);
  var unit =
    legacyUnit === 'player' || legacyUnit === 'entity' || legacyUnit === 'pair'
      ? legacyUnit
      : standingsViewOptions.resolveListUnit(match, scoreType);

  var listRows = [];
  var headPlayerLabel = 'PLAYER';
  if (unit === 'pair') {
    listRows = buildEntityOrPairRows(match, true);
    headPlayerLabel = 'PAIR';
  } else if (unit === 'entity') {
    listRows = buildEntityOrPairRows(match, false);
    headPlayerLabel = 'COMBO';
  } else {
    listRows = buildPlayerRows(match, scoreType);
    headPlayerLabel = 'PLAYER';
  }

  listRows = filterRowsByGenderView(listRows, view);

  var emptyText = '';
  if (!listRows.length) {
    if (view === 'male' || view === 'female') {
      emptyText = '暂无符合筛选的球员';
    } else if (!isStationStarted(match)) {
      emptyText =
        unit === 'player' ? '已分组后显示球员阵容' : '尚未形成合法组合';
    } else {
      emptyText = '暂无榜单数据';
    }
  }

  return {
    boardView: view,
    selection: selection,
    listUnit: unit,
    showTeamBoard: false,
    listRows: listRows,
    listEmptyText: emptyText,
    leaderboardViewLabel: standingsViewOptions.boardViewLabel(
      view,
      scoreType,
      match
    ),
    headPlayerLabel: headPlayerLabel,
    roundId: asString(src.roundId),
    roundHeadline: asString(src.roundHeadline)
  };
}

module.exports = {
  buildSeriesRoundBoardViewModel: buildSeriesRoundBoardViewModel,
  emptyStatusLabel: emptyStatusLabel,
  isStationStarted: isStationStarted
};
