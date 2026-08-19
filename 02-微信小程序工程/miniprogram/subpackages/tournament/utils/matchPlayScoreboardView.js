/**
 * G5–G8 得分榜视图：单场详情与 Series 莱德杯共用。
 * 顶部红蓝分由 matchPlayTeamScore 计算；卡片结构对齐 tournament detail。
 */

var matchPlayTeamScore = require('../../../utils/matchPlayTeamScore.js');
var matchPlayScoreboardMock = require('../../../utils/matchPlayScoreboardMock.js');
var strokeEntityValidator = require('../../../utils/strokeEntityValidator.js');
var teamMatchStore = require('../../../utils/teamMatchStore.js');
var matchStatus = require('../../../utils/matchStatus.js');
var matchPlayResult = require('../../../utils/matchPlayResult.js');
var teamMatchCapabilities = require('../../../utils/teamMatchCapabilities.js');

var buildMockMatchPlayScoreboard = matchPlayScoreboardMock.buildMockMatchPlayScoreboard;
var buildMatchPlayHoleTimelineColumns = matchPlayScoreboardMock.buildMatchPlayHoleTimelineColumns;
var isInterTeamMatch = teamMatchCapabilities.isInterTeamMatch;
var DEFAULT_ORG_LOGO = teamMatchCapabilities.DEFAULT_ORG_LOGO;
var buildMatchPlayResultSummary = matchPlayResult.buildMatchPlayResultSummary;

function defaultResolveNickname(raw) {
  if (!raw || typeof raw !== 'object') return '';
  return String(
    raw.displayName || raw.nickname || raw.nickName || raw.name || raw.playerNameSnapshot || ''
  ).trim();
}

function defaultAvatar(userId, slotPlayer, playerLookup) {
  var id = userId != null ? String(userId).trim() : '';
  var src = (playerLookup && id && playerLookup[id]) || null;
  return (
    (src && src.avatar) ||
    (slotPlayer && slotPlayer.avatar) ||
    (slotPlayer && slotPlayer.avatarUrl) ||
    ''
  );
}

function defaultLookup(match, resolveId) {
  var map = {};
  var users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  users.forEach(function (u) {
    if (!u || typeof u !== 'object') return;
    var primaryId = resolveId(u);
    if (!primaryId) return;
    var entry = {
      userId: primaryId,
      nickname: defaultResolveNickname(u) || '未知球员',
      avatar: u.avatar || u.avatarUrl || '',
      name: defaultResolveNickname(u)
    };
    map[primaryId] = entry;
  });
  return map;
}

function buildMatchPlayResultSummaryWithStatus(scoresA, scoresB, startHole) {
  var summary = buildMatchPlayResultSummary(scoresA, scoresB, startHole) || {};
  var thru = Number(summary.thru) || 0;
  var status = summary.clinched || thru >= 18 ? 'finished' : 'open';
  return Object.assign({}, summary, { status: status });
}

function resolveMatchPlayCardStartHole(match, group) {
  var groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
  var bucket = matchPlayTeamScore.readMatchPlayGroupScoreBucket(match, groupId);
  var meta =
    typeof teamMatchStore.normalizeMatchPlayMeta === 'function'
      ? teamMatchStore.normalizeMatchPlayMeta(bucket.matchPlayMeta)
      : null;
  return meta && meta.startHole ? meta.startHole : 1;
}

function buildMatchPlayPkProgressSummary(match, groups, teamIds, isG5, opts) {
  var list = Array.isArray(groups) ? groups : [];
  var totalMatches = list.length;
  var finishedMatches = 0;
  if (match && totalMatches > 0) {
    for (var i = 0; i < list.length; i++) {
      var group = list[i];
      var sideScores = matchPlayTeamScore.resolveMatchPlayGroupSideScores(
        match,
        group,
        teamIds,
        isG5,
        opts
      );
      var startHole = resolveMatchPlayCardStartHole(match, group);
      var summary = buildMatchPlayResultSummaryWithStatus(
        sideScores.scoresA,
        sideScores.scoresB,
        startHole
      );
      if (summary && summary.status === 'finished') finishedMatches += 1;
    }
  }
  return {
    finishedMatches: finishedMatches,
    totalMatches: totalMatches,
    matchesCompleteText: finishedMatches + '/' + totalMatches + ' MATCHES COMPLETE'
  };
}

function hasMatchPlayGroupAnyHoleScore(match, group, teamIds, isG5, opts) {
  var sideScores = matchPlayTeamScore.resolveMatchPlayGroupSideScores(
    match,
    group,
    teamIds,
    isG5,
    opts
  );
  var scoresA = sideScores.scoresA || [];
  var scoresB = sideScores.scoresB || [];
  var len = Math.max(scoresA.length, scoresB.length, 18);
  for (var hi = 0; hi < len; hi++) {
    if (
      matchPlayTeamScore.isMatchPlayFilledScore(scoresA[hi]) &&
      matchPlayTeamScore.isMatchPlayFilledScore(scoresB[hi])
    ) {
      var sa = Number(scoresA[hi]);
      var sb = Number(scoresB[hi]);
      if (Number.isFinite(sa) && Number.isFinite(sb)) return true;
    }
  }
  return false;
}

function buildMatchPlayCardCenterStatus(match, group, teamIds, isG5, opts) {
  var sideScores = matchPlayTeamScore.resolveMatchPlayGroupSideScores(
    match,
    group,
    teamIds,
    isG5,
    opts
  );
  var scoresA = sideScores.scoresA;
  var scoresB = sideScores.scoresB;
  var startHole = resolveMatchPlayCardStartHole(match, group);
  var summary = buildMatchPlayResultSummaryWithStatus(scoresA, scoresB, startHole);
  var thru = summary.thru;

  var completed = !!(
    matchStatus.isGroupConfirmedFinished(group && group.status) ||
    matchStatus.getMatchStatus(group, { source: 'groups' }).isCompleted
  );
  var notStarted = !completed && thru === 0;

  if (notStarted) {
    return {
      phaseLabel: '',
      statusMain: 'VS',
      statusSub: '',
      statusLeadClass: 'mp-sb-lead--vs',
      statusLayerClass: 'not-started'
    };
  }

  var matchPlayOver = completed || !!summary.clinched;
  var phaseLabel = matchPlayOver ? 'FINAL' : 'THRU ' + thru;
  var useResultSummary = matchPlayOver;
  var statusMain = summary.statusMain;
  var statusSub = summary.statusSub;
  if (!useResultSummary) {
    if (summary.leader === 'A') {
      statusMain = String(summary.up);
      statusSub = 'UP';
    } else if (summary.leader === 'B') {
      statusMain = String(summary.up);
      statusSub = 'DN';
    } else {
      statusMain = 'TIED';
      statusSub = '';
    }
  }

  var statusLeadClass = 'mp-sb-lead--as';
  var statusLayerClass = 'all-square';
  if (summary.leader === 'A') {
    statusLeadClass = 'mp-sb-lead--a';
    statusLayerClass = 'winner-a';
  } else if (summary.leader === 'B') {
    statusLeadClass = 'mp-sb-lead--b';
    statusLayerClass = 'winner-b';
  }

  return {
    phaseLabel: phaseLabel,
    statusMain: statusMain,
    statusSub: statusSub,
    statusLeadClass: statusLeadClass,
    statusLayerClass: statusLayerClass
  };
}

function buildMatchPlayCardDetailTable(match, group, teamIds, isG5, opts) {
  var sideScores = matchPlayTeamScore.resolveMatchPlayGroupSideScores(
    match,
    group,
    teamIds,
    isG5,
    opts
  );
  var scoresA = sideScores.scoresA;
  var scoresB = sideScores.scoresB;
  var startHole = resolveMatchPlayCardStartHole(match, group);
  var holeColumns = buildMatchPlayHoleTimelineColumns(startHole);
  var pars18 =
    opts && typeof opts.getHolePars === 'function' ? opts.getHolePars(match) : [];
  var holeLabels = [];
  var pars = [];
  var statusCells = [];
  var scoreCells = [];
  var holeDots = [];
  var aWins = 0;
  var bWins = 0;

  for (var ci = 0; ci < holeColumns.length; ci++) {
    var col = holeColumns[ci];
    var actualHole = col.actualHole;
    var hi = actualHole - 1;
    holeLabels.push(col.displayHole);
    var parVal = pars18[hi];
    pars.push(parVal != null && parVal !== '' ? parVal : '-');

    var holeResult = '';
    var dotCls = 'empty';
    var rawA = scoresA[hi];
    var rawB = scoresB[hi];
    var bothFilled =
      matchPlayTeamScore.isMatchPlayFilledScore(rawA) &&
      matchPlayTeamScore.isMatchPlayFilledScore(rawB);
    var sa = NaN;
    var sb = NaN;
    if (bothFilled) {
      sa = Number(rawA);
      sb = Number(rawB);
      if (Number.isFinite(sa) && Number.isFinite(sb)) {
        if (sa < sb) {
          holeResult = 'A';
          dotCls = 'mp-sb-dot--a';
          aWins += 1;
        } else if (sb < sa) {
          holeResult = 'B';
          dotCls = 'mp-sb-dot--b';
          bWins += 1;
        } else {
          holeResult = 'AS';
          dotCls = 'mp-sb-dot--as';
        }
      }
    }

    if (bothFilled && Number.isFinite(sa) && Number.isFinite(sb)) {
      var diff = aWins - bWins;
      var leader = 'AS';
      var up = 0;
      if (diff > 0) {
        leader = 'A';
        up = diff;
      } else if (diff < 0) {
        leader = 'B';
        up = -diff;
      }
      var text = leader === 'AS' ? 'TIED' : leader === 'B' ? up + 'DN' : up + 'UP';
      var cls =
        leader === 'A' ? 'mp-sb-st--up' : leader === 'B' ? 'mp-sb-st--dn' : 'mp-sb-st--as';
      statusCells.push({ text: text, cls: cls });
      scoreCells.push({
        a: String(sa),
        b: String(sb),
        result: holeResult,
        splitCls:
          holeResult === 'A'
            ? 'mp-sb-split--a'
            : holeResult === 'B'
              ? 'mp-sb-split--b'
              : 'mp-sb-split--tie',
        empty: false
      });
    } else {
      statusCells.push({ text: '-', cls: '' });
      scoreCells.push({
        a: '-',
        b: '-',
        result: '',
        splitCls: 'mp-sb-split--pending',
        empty: false,
        pending: true
      });
    }

    holeDots.push({
      n: ci + 1,
      displayHole: col.displayHole,
      actualHole: actualHole,
      result: holeResult,
      cls: dotCls
    });
  }

  return {
    holeColumns: holeColumns,
    holeLabels: holeLabels,
    pars: pars,
    statusCells: statusCells,
    scoreCells: scoreCells,
    holeDots: holeDots
  };
}

function buildMatchPlaySideView(members) {
  var list = Array.isArray(members) ? members.filter(function (m) { return m && m.userId; }) : [];
  return {
    kind: list.length >= 2 ? 'pair' : 'single',
    members: list
  };
}

function buildMatchPlayCardSides(match, group, playerLookup, teamIds, opts) {
  var resolveId =
    opts && typeof opts.resolveAnyPlayerId === 'function'
      ? opts.resolveAnyPlayerId
      : matchPlayTeamScore.resolveAnyPlayerId;
  var resolveNickname =
    opts && typeof opts.resolveAnyPlayerNickname === 'function'
      ? opts.resolveAnyPlayerNickname
      : defaultResolveNickname;
  var resolveDisplayName =
    opts && typeof opts.resolveViewerDisplayName === 'function'
      ? opts.resolveViewerDisplayName
      : function (id, fallback) {
          return fallback || '未知球员';
        };
  var resolveAvatar =
    opts && typeof opts.resolveGroupedPlayerAvatar === 'function'
      ? opts.resolveGroupedPlayerAvatar
      : defaultAvatar;

  var emptySide = { kind: 'single', members: [] };
  var players = Array.isArray(group && group.players) ? group.players : [];
  var filled = players
    .map(function (p) {
      return {
        userId: resolveId(p),
        position: Number(p && (p.position != null ? p.position : p.slotIndex)) || 0,
        raw: p
      };
    })
    .filter(function (p) {
      return p.userId;
    })
    .sort(function (a, b) {
      return a.position - b.position || String(a.userId).localeCompare(String(b.userId));
    });

  if (!filled.length) {
    return { sideA: emptySide, sideB: emptySide };
  }

  var teamAId = teamIds && teamIds.teamAId ? String(teamIds.teamAId) : '';
  var teamBId = teamIds && teamIds.teamBId ? String(teamIds.teamBId) : '';
  var teamIdByUser = {};
  var users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  users.forEach(function (user) {
    var uid = resolveId(user);
    if (!uid) return;
    var teamId =
      user.matchTeamId != null && String(user.matchTeamId).trim() !== ''
        ? String(user.matchTeamId).trim()
        : user.groupId != null && String(user.groupId).trim() !== ''
          ? String(user.groupId).trim()
          : '';
    if (teamId) teamIdByUser[uid] = teamId;
  });

  function buildMember(userId, slotPlayer) {
    var id = userId != null ? String(userId).trim() : '';
    var src = (playerLookup && id && playerLookup[id]) || null;
    var fromSrc = src
      ? String(src.displayName || src.nickname || src.name || '').trim()
      : '';
    var fromSlot = resolveNickname(slotPlayer);
    var displayName = resolveDisplayName(id, fromSrc || fromSlot || '未知球员', {
      publicName: fromSrc,
      snapshotName: fromSlot || fromSrc,
      identityMasked: !!(src && src.identityMasked) || !!(slotPlayer && slotPlayer.identityMasked)
    });
    return {
      userId: id,
      displayName: displayName,
      nickname: (src && src.nickname) || displayName,
      name: (src && src.name) || displayName,
      avatar: resolveAvatar(id, slotPlayer, playerLookup)
    };
  }

  var membersA = [];
  var membersB = [];
  filled.forEach(function (p) {
    var member = buildMember(p.userId, p.raw);
    var teamId = teamIdByUser[p.userId] || '';
    if (teamAId && teamId === teamAId) membersA.push(member);
    else if (teamBId && teamId === teamBId) membersB.push(member);
  });

  if (!membersA.length && !membersB.length) {
    if (filled.length <= 2) {
      filled.forEach(function (p, idx) {
        var member = buildMember(p.userId, p.raw);
        if (idx === 0) membersA.push(member);
        else membersB.push(member);
      });
    } else {
      var mid = Math.ceil(filled.length / 2);
      filled.forEach(function (p, idx) {
        var member = buildMember(p.userId, p.raw);
        if (idx < mid) membersA.push(member);
        else membersB.push(member);
      });
    }
  }

  return {
    sideA: buildMatchPlaySideView(membersA),
    sideB: buildMatchPlaySideView(membersB)
  };
}

function overlayTeamScores(board, summary, match) {
  var teamGroups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var interTeam = isInterTeamMatch(match);
  var teamAName =
    teamGroups[0] && String(teamGroups[0].name || '').trim()
      ? String(teamGroups[0].name).trim()
      : interTeam
        ? '球队A'
        : (board.teamA && board.teamA.name) || '红队';
  var teamBName =
    teamGroups[1] && String(teamGroups[1].name || '').trim()
      ? String(teamGroups[1].name).trim()
      : interTeam
        ? '球队B'
        : (board.teamB && board.teamB.name) || '蓝队';
  var teamALogo = interTeam
    ? String((teamGroups[0] && teamGroups[0].sourceTeamLogo) || '').trim() || DEFAULT_ORG_LOGO
    : '';
  var teamBLogo = interTeam
    ? String((teamGroups[1] && teamGroups[1].sourceTeamLogo) || '').trim() || DEFAULT_ORG_LOGO
    : '';
  return {
    teamA: Object.assign({}, board.teamA, {
      name: teamAName,
      logo: teamALogo,
      score: matchPlayTeamScore.formatMatchPlayTeamScore(summary.redScore)
    }),
    teamB: Object.assign({}, board.teamB, {
      name: teamBName,
      logo: teamBLogo,
      score: matchPlayTeamScore.formatMatchPlayTeamScore(summary.blueScore)
    })
  };
}

/**
 * @param {object} match
 * @param {object} [opts]
 * @param {boolean} [opts.resetExpanded]
 * @param {object} [opts.prevExpandedById]
 * @param {object} [opts.scoreOverride] { redScore, blueScore } 覆盖顶部累计（Series）
 */
function buildMatchPlayScoreboard(match, opts) {
  var o = opts || {};
  var board = buildMockMatchPlayScoreboard();
  var summary =
    o.scoreOverride && typeof o.scoreOverride === 'object'
      ? {
          redScore: Number(o.scoreOverride.redScore) || 0,
          blueScore: Number(o.scoreOverride.blueScore) || 0
        }
      : matchPlayTeamScore.buildMatchPlayTeamScoreSummary(match, o);
  var teamScores = overlayTeamScores(board, summary, match);
  var groups = match && Array.isArray(match.groups) ? match.groups : [];
  var resetExpanded = !!o.resetExpanded;
  var prevExpandedById = o.prevExpandedById && typeof o.prevExpandedById === 'object' ? o.prevExpandedById : {};

  function applyCardMeta(card, index, groupId) {
    if (!card) return card;
    var id = card.id != null ? String(card.id) : '';
    var gid = groupId != null && String(groupId).trim() !== '' ? String(groupId) : 'mock';
    var cardKey = gid + '_' + index;
    var expanded = resetExpanded
      ? false
      : !!(id && Object.prototype.hasOwnProperty.call(prevExpandedById, id) && prevExpandedById[id]);
    return Object.assign({}, card, { expanded: expanded, cardKey: cardKey });
  }

  if (!groups.length || !board || !Array.isArray(board.matches) || !board.matches.length) {
    if (o.allowMockCards === false) {
      return Object.assign({}, board, teamScores, {
        finishedMatches: 0,
        totalMatches: 0,
        matchesCompleteText: '0/0 MATCHES COMPLETE',
        matches: [],
        redScore: summary.redScore,
        blueScore: summary.blueScore
      });
    }
    var mockMatches = (board.matches || []).map(function (m, index) {
      return applyCardMeta(Object.assign({}, m, { detailsMode: 'scorecard' }), index, 'mock');
    });
    var finishedMatches = board.finishedMatches != null ? board.finishedMatches : 0;
    var totalMatches = board.totalMatches != null ? board.totalMatches : mockMatches.length;
    return Object.assign({}, board, teamScores, {
      finishedMatches: finishedMatches,
      totalMatches: totalMatches,
      matchesCompleteText:
        board.matchesCompleteText || finishedMatches + '/' + totalMatches + ' MATCHES COMPLETE',
      matches: mockMatches,
      redScore: summary.redScore,
      blueScore: summary.blueScore
    });
  }

  var resolveId =
    typeof o.resolveAnyPlayerId === 'function'
      ? o.resolveAnyPlayerId
      : matchPlayTeamScore.resolveAnyPlayerId;
  var lookup =
    typeof o.buildGroupPlayerLookup === 'function'
      ? o.buildGroupPlayerLookup(match)
      : defaultLookup(match, resolveId);
  var teamIds = matchPlayTeamScore.resolveMatchPlaySideTeamIds(match);
  var gameMode = strokeEntityValidator.resolveGameMode(match);
  var isG5 = strokeEntityValidator.isG5MatchPlayMode(gameMode);
  var templates = board.matches;
  var emptyHoleDots = [];
  for (var di = 1; di <= 18; di++) {
    emptyHoleDots.push({ n: di, cls: 'empty', result: '' });
  }
  var emptyDetail = {
    holeColumns: [],
    holeLabels: [],
    pars: [],
    statusCells: [],
    scoreCells: [],
    holeDots: emptyHoleDots
  };
  var matches = groups.map(function (group, index) {
    var base = Object.assign({}, templates[index] || templates[templates.length - 1]);
    var sides = buildMatchPlayCardSides(match, group, lookup, teamIds, o);
    var groupId = group && group.groupId != null ? String(group.groupId) : '';
    var id = groupId || base.id;
    var centerStatus = buildMatchPlayCardCenterStatus(match, group, teamIds, isG5, o);
    var started = hasMatchPlayGroupAnyHoleScore(match, group, teamIds, isG5, o);
    var detailsMode = started ? 'scorecard' : 'comingSoon';
    var detailTable = started
      ? buildMatchPlayCardDetailTable(match, group, teamIds, isG5, o)
      : emptyDetail;
    return applyCardMeta(
      Object.assign({}, base, {
        id: id,
        detailsMode: detailsMode,
        sideA: sides.sideA,
        sideB: sides.sideB,
        phaseLabel: centerStatus.phaseLabel,
        statusMain: centerStatus.statusMain,
        statusSub: centerStatus.statusSub,
        statusLeadClass: centerStatus.statusLeadClass,
        statusLayerClass: centerStatus.statusLayerClass,
        holeColumns: detailTable.holeColumns,
        holeLabels: detailTable.holeLabels,
        pars: detailTable.pars,
        statusCells: detailTable.statusCells,
        scoreCells: detailTable.scoreCells,
        holeDots: detailTable.holeDots
      }),
      index,
      groupId || 'mock'
    );
  });
  var pkProgress = buildMatchPlayPkProgressSummary(match, groups, teamIds, isG5, o);
  return Object.assign({}, board, teamScores, pkProgress, {
    matches: matches,
    redScore: summary.redScore,
    blueScore: summary.blueScore
  });
}

module.exports = {
  buildMatchPlayScoreboard: buildMatchPlayScoreboard,
  overlayTeamScores: overlayTeamScores,
  buildMatchPlayPkProgressSummary: buildMatchPlayPkProgressSummary
};
