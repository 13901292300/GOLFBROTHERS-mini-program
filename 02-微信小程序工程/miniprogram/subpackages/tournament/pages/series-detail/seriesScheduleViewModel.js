/**
 * Series 赛程 TAB ViewModel（纯投影）
 * - 分组卡：复用 utils/tournamentGroupCardView（对齐 detail 出发表/分组表权威口径）
 * - 无 TOT；轮次选择独立于总榜
 * - 不写 storage；不产出进入旧 detail 的 navUrl
 */

var seriesDetailViewModel = require('./seriesDetailViewModel.js');
var seriesRoundVisualState = require('./seriesRoundVisualState.js');
var seriesRoundInfoText = require('./seriesRoundInfoText.js');
var tournamentGroupDraft = require('../../../../utils/tournamentGroupDraft.js');
var tournamentGroupCardView = require('../../../../utils/tournamentGroupCardView.js');
var {
  isG2G3FamilyMode,
  isG4FamilyMode,
  isG5MatchPlayMode,
  isG6G7MatchPlayMode
} = require('../../../../utils/strokeEntityValidator.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function deepClone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function indexRoundStates(roundStates) {
  var map = Object.create(null);
  var list = Array.isArray(roundStates) ? roundStates : [];
  for (var i = 0; i < list.length; i++) {
    var r = list[i] || {};
    var id = asString(r.roundId);
    if (!id) continue;
    map[id] = r;
  }
  return map;
}

/**
 * 赛程轮次选择器：仅 R1/R2…，无 TOT
 * R-STATE：优先 getMatchById 权威投影；否则回落 roundStates 行
 * @returns {{ roundSelectorItems: Array, selectedKey: string }}
 */
function buildScheduleRoundSelector(series, roundStates, getMatchById) {
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  var stateById = indexRoundStates(roundStates);
  var getMatch =
    typeof getMatchById === 'function' ? getMatchById : function () {
      return null;
    };
  var items = [];
  for (var i = 0; i < rounds.length; i++) {
    var round = rounds[i] || {};
    var rid = asString(round.roundId);
    if (!rid) continue;
    var st = stateById[rid] || {};
    var index =
      round.index != null && Number.isFinite(Number(round.index))
        ? Number(round.index)
        : st.index != null && Number.isFinite(Number(st.index))
          ? Number(st.index)
          : i + 1;
    var matchId = asString(round.matchId);
    var match = matchId ? getMatch(matchId) : null;
    var visual = match
      ? seriesRoundVisualState.resolveSeriesRoundVisualState(round, match)
      : seriesRoundVisualState.normalizeRoundVisualFromStateRow(st);
    items.push({
      key: rid,
      label: asString(st.label) || 'R' + index,
      state: visual.state,
      stateClass: visual.stateClass,
      statusLabel: visual.statusLabel,
      statusToken: visual.state,
      isLive: visual.state === 'live',
      isSelected: false,
      showLiveBadge: visual.state === 'live',
      showSelectedCheck: false,
      index: index
    });
  }
  var selectedKey = items.length ? items[0].key : '';
  if (selectedKey) {
    for (var j = 0; j < items.length; j++) {
      var sel = items[j].key === selectedKey;
      items[j].isSelected = sel;
      items[j].showSelectedCheck = sel;
    }
  }
  return {
    roundSelectorItems: items,
    selectedKey: selectedKey
  };
}

function findRoundById(series, roundId) {
  var id = asString(roundId);
  var rounds = Array.isArray(series && series.rounds) ? series.rounds : [];
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === id) return rounds[i];
  }
  return null;
}

function hasNonEmptyGroup(groups) {
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var players = (list[i] && list[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      if (players[j] && asString(players[j].userId)) return true;
    }
  }
  return false;
}

/** 与赛程 CTA「开始分组 / 修改分组」同一规则：正式 groups 中存在有效 userId */
function roundHasFormalGroups(match) {
  return hasNonEmptyGroup(match && match.groups);
}

function isScheduleRoundCancelled(round, stateById) {
  if (asString(round && round.roundStatus).toLowerCase() === 'cancelled') return true;
  if (asString(round && round.roundStatus).toLowerCase() === 'canceled') return true;
  var rid = asString(round && round.roundId);
  var st = rid && stateById ? stateById[rid] : null;
  var visual = seriesRoundVisualState.normalizeRoundVisualFromStateRow(st || {});
  return visual.state === 'cancelled';
}

function resolveRoundDisplayIndex(round, orderIndex) {
  var n =
    round && round.index != null && Number.isFinite(Number(round.index))
      ? Number(round.index)
      : orderIndex + 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : orderIndex + 1;
}

/**
 * 跨轮次提前分组：找当前轮之前最早尚未正式分组的轮次。
 * - 顺序：series.rounds 正式数组序
 * - 已分组：hasNonEmptyGroup（与 CTA 文案同源）
 * - cancelled：跳过
 * - 已结束（completed）前序轮：不阻断当前轮（跳过）
 *
 * @returns {null|{ roundId, roundIndex, roundName, matchId, confirmTitle, confirmContent }}
 */
function findEarliestPriorUngroupedRound(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  var selectedRoundId = asString(src.selectedRoundId);
  var getMatchById =
    typeof src.getMatchById === 'function' ? src.getMatchById : function () {
      return null;
    };
  var stateById = indexRoundStates(src.roundStates);
  if (!series || !selectedRoundId) return null;

  var rounds = Array.isArray(series.rounds) ? series.rounds : [];
  var selectedPos = -1;
  for (var i = 0; i < rounds.length; i++) {
    if (asString(rounds[i] && rounds[i].roundId) === selectedRoundId) {
      selectedPos = i;
      break;
    }
  }
  if (selectedPos <= 0) return null;

  for (var p = 0; p < selectedPos; p++) {
    var round = rounds[p] || {};
    var rid = asString(round.roundId);
    if (!rid) continue;
    if (isScheduleRoundCancelled(round, stateById)) continue;

    var mid = asString(round.matchId);
    var match = mid ? getMatchById(mid) : null;
    var life = seriesDetailViewModel.normalizeMatchLifecycle(match);
    // 已结束前序轮：即使无分组也不阻断当前轮
    if (life && life.isCompleted) continue;

    if (roundHasFormalGroups(match)) continue;

    var roundIndex = resolveRoundDisplayIndex(round, p);
    return {
      roundId: rid,
      roundIndex: roundIndex,
      roundName: asString(round.name) || '第' + roundIndex + '轮',
      matchId: mid,
      confirmTitle: '分组顺序提醒',
      confirmContent:
        '第 ' + roundIndex + ' 轮尚未分组，是否仍要先设置当前轮次的分组？'
    };
  }
  return null;
}

function resolvePanelMode(matchLifecycle) {
  var life = matchLifecycle || {};
  if (life.isOngoing || life.isCompleted) return 'tee';
  return 'groups';
}

function resolveManageFlags(lifecycleAccess, canManageGroups, canStartMatch) {
  var access = lifecycleAccess && typeof lifecycleAccess === 'object' ? lifecycleAccess : {};
  var life = asString(access.lifecycleStatus);
  var blocked =
    !!access.isDraftPreview ||
    !!access.isHistorical ||
    (life && life !== 'published');
  return {
    canManageGroups: !blocked && !!canManageGroups,
    canStartMatch: !blocked && !!canStartMatch
  };
}

function buildSeatRegisterInfo(groups) {
  var users = [];
  var seen = Object.create(null);
  var list = Array.isArray(groups) ? groups : [];
  for (var i = 0; i < list.length; i++) {
    var players = (list[i] && list[i].players) || [];
    for (var j = 0; j < players.length; j++) {
      var p = players[j];
      var uid = asString(p && p.userId);
      if (!uid || seen[uid]) continue;
      seen[uid] = true;
      users.push({
        userId: uid,
        displayName:
          asString(p.displayName) ||
          asString(p.competitionName) ||
          asString(p.name) ||
          asString(p.nickname),
        competitionName:
          asString(p.competitionName) ||
          asString(p.displayName) ||
          asString(p.name),
        avatar: asString(p && p.avatar),
        gender: asString(p && p.gender),
        matchTeamId: asString(p && p.matchTeamId) || asString(p && p.affiliationId),
        groupId: asString(p && p.groupId) || asString(p && p.seriesParticipantId),
        matchTeamName: asString(p && p.matchTeamName),
        groupName: asString(p && p.groupName),
        seriesParticipantId: asString(p && p.seriesParticipantId)
      });
    }
  }
  return { totalCount: users.length, users: users };
}

/** G2/G4/G5 组合预览：挂在权威分组卡上，不改核心展示字段 */
function attachCompositionPreviews(cards, match, series) {
  if (!match || !Array.isArray(cards) || !cards.length) return cards || [];
  var gameMode = asString(match.gameMode || match.selectedGameMode);
  var isG2G3 = isG2G3FamilyMode(gameMode);
  var isG6G7 = isG6G7MatchPlayMode(gameMode);
  var isG4 = isG4FamilyMode(gameMode);
  var isG5 = isG5MatchPlayMode(gameMode);
  if (!isG2G3 && !isG4 && !isG5) return cards;

  var groups = Array.isArray(match.groups) ? match.groups : [];
  var registerInfo = buildSeatRegisterInfo(groups);
  var persistedRegister = tournamentGroupDraft.resolveRegisterInfo(match);
  if (
    (!registerInfo.users || !registerInfo.users.length) &&
    persistedRegister &&
    Array.isArray(persistedRegister.users) &&
    persistedRegister.users.length
  ) {
    registerInfo = persistedRegister;
  }
  var teamGroups = Array.isArray(match.teamGroups) ? match.teamGroups : [];
  var compositionMode =
    isG6G7
      ? '2+2'
      : asString(match.strokeCompositionMode) === '4+0'
        ? '4+0'
        : '2+2';
  var matchLike = isG2G3
    ? Object.assign({}, match, {
        strokeCompositionMode: compositionMode,
        registerInfo: registerInfo
      })
    : null;
  var g5MatchLike = isG5
    ? { registerInfo: registerInfo, teamGroups: teamGroups }
    : null;

  return cards.map(function (card, index) {
    var g = groups[index] || null;
    var draftLike = {
      groupId: card.groupId,
      groupName: card.badge || card.groupName,
      players: Array.isArray(g && g.players) ? g.players : []
    };
    var next = Object.assign({}, card);
    if (isG5 && g5MatchLike) {
      var lines = tournamentGroupDraft.buildMatchPlayTeamPreview(draftLike, g5MatchLike);
      if (lines && lines.length) next.matchPlayTeamPreview = lines;
    } else if (isG2G3 && matchLike) {
      var preview = tournamentGroupDraft.buildCompositionPreview(matchLike, draftLike);
      if (preview) next.compositionPreview = preview;
    } else if (isG4) {
      var g4Preview = tournamentGroupDraft.buildG4CompositionPreviewFromSeats(
        draftLike,
        match,
        registerInfo
      );
      if (g4Preview) next.compositionPreview = g4Preview;
    }
    return next;
  });
}

/**
 * 权威分组卡投影（与 detail 同模块）
 * series 用于 seriesParticipantId → 球队/分队标签
 */
function projectGroupCards(match, series) {
  if (!match) return [];
  var cards = tournamentGroupCardView.buildReadonlyGroupCards(match, {
    series: series || null
  });
  return attachCompositionPreviews(cards, match, series);
}

/** 出发表与分组表同构：同一权威投影 */
function projectTeeGroups(match, series) {
  return projectGroupCards(match, series);
}

function emptyCta() {
  return {
    showEditGroups: false,
    /** 无正式分组：开始分组；有正式分组：修改分组（对齐队际赛底部 CTA） */
    editGroupsLabel: '开始分组',
    blockMessage: ''
  };
}

function emptyScheduleViewModel() {
  return {
    ok: true,
    selectedKey: '',
    roundSelectorItems: [],
    roundSelector: [],
    roundInfoText: '',
    panelMode: 'groups',
    matchId: '',
    gameMode: '',
    stationStatusLabel: '',
    canEnterRound: false,
    blockReason: '',
    blockMessage: '',
    groupCards: [],
    teeGroups: [],
    hasGroups: false,
    cta: emptyCta(),
    strokeCompositionMode: '2+2',
    showCompositionMode: false,
    showCompositionPreview: false
  };
}

function attachRoundDock(vm, roundStates, series) {
  var out = vm && typeof vm === 'object' ? vm : emptyScheduleViewModel();
  var items = Array.isArray(out.roundSelectorItems) ? out.roundSelectorItems : [];
  out.roundSelectorItems = items;
  out.roundSelector = items;
  out.roundInfoText = seriesRoundInfoText.buildSeriesRoundInfoText(
    out.selectedKey,
    roundStates,
    series
  );
  return out;
}

/**
 * @param {object} input
 * @param {object} input.series
 * @param {string} [input.selectedRoundId]
 * @param {Array} [input.roundStates]
 * @param {Function} input.getMatchById
 * @param {Function} input.getIndexByMatchId
 * @param {boolean} [input.canManageGroups]
 * @param {boolean} [input.canStartMatch]
 * @param {object} [input.lifecycleAccess]
 */
function buildSeriesScheduleViewModel(input) {
  var src = input && typeof input === 'object' ? input : {};
  var series = src.series;
  if (!series || typeof series !== 'object') {
    return attachRoundDock(
      Object.assign(emptyScheduleViewModel(), {
        ok: false,
        reason: 'series_required',
        blockMessage: '无法加载系列赛'
      }),
      src.roundStates,
      series
    );
  }

  var selector = buildScheduleRoundSelector(
    series,
    src.roundStates,
    src.getMatchById
  );
  var items = selector.roundSelectorItems.slice();
  var valid = Object.create(null);
  for (var i = 0; i < items.length; i++) {
    valid[items[i].key] = true;
  }
  var selectedKey = asString(src.selectedRoundId);
  if (!selectedKey || !valid[selectedKey]) {
    selectedKey = selector.selectedKey;
  }
  for (var j = 0; j < items.length; j++) {
    var selected = items[j].key === selectedKey;
    items[j].isSelected = selected;
    items[j].showSelectedCheck = selected;
  }

  var round = findRoundById(series, selectedKey);
  var flags = resolveManageFlags(
    src.lifecycleAccess,
    src.canManageGroups,
    src.canStartMatch
  );

  if (!round) {
    return attachRoundDock(
      Object.assign(emptyScheduleViewModel(), {
        ok: true,
        selectedKey: selectedKey,
        roundSelectorItems: items,
        blockReason: 'round_missing',
        blockMessage: items.length ? '轮次数据缺失' : '暂无轮次',
        cta: Object.assign(emptyCta(), {
          blockMessage: items.length ? '轮次数据缺失' : '暂无轮次'
        })
      }),
      src.roundStates,
      series
    );
  }

  var gate = seriesDetailViewModel.evaluateRoundStationGate(series, round, {
    getMatchById: src.getMatchById,
    getIndexByMatchId: src.getIndexByMatchId
  });

  if (!gate.canEnterRound) {
    return attachRoundDock(
      {
        ok: true,
        selectedKey: selectedKey,
        roundSelectorItems: items,
        panelMode: 'groups',
        matchId: asString(gate.matchId),
        gameMode: asString(round.gameMode),
        stationStatusLabel: asString(gate.stationStatusLabel),
        canEnterRound: false,
        blockReason: asString(gate.blockReason),
        blockMessage: asString(gate.blockMessage),
        groupCards: [],
        teeGroups: [],
        hasGroups: false,
        cta: Object.assign(emptyCta(), {
          blockMessage: asString(gate.blockMessage)
        }),
        strokeCompositionMode: '2+2',
        showCompositionMode: false,
        showCompositionPreview: false
      },
      src.roundStates,
      series
    );
  }

  var match = gate.match;
  var life =
    gate.matchLifecycle ||
    seriesDetailViewModel.normalizeMatchLifecycle(match);
  var panelMode = resolvePanelMode(life);
  var gameMode = asString(match && (match.gameMode || match.selectedGameMode)) ||
    asString(round.gameMode);
  var isG2G3 = isG2G3FamilyMode(gameMode);
  var isG6G7 = isG6G7MatchPlayMode(gameMode);
  var showCompositionMode = isG2G3 && !isG6G7;
  var showCompositionPreview = isG2G3;
  var strokeCompositionMode =
    isG6G7
      ? '2+2'
      : asString(match && match.strokeCompositionMode) === '4+0'
        ? '4+0'
        : '2+2';

  var seriesRef = src.series || series;
  var groupCards =
    panelMode === 'groups' ? projectGroupCards(match, seriesRef) : [];
  var teeGroups =
    panelMode === 'tee' ? projectTeeGroups(match, seriesRef) : [];
  var hasGroups = hasNonEmptyGroup(match && match.groups);
  var isRegistering = !!life.isRegistering;

  // 对齐队际赛 detail：有管理权限即可进入独立 group-editor（含进行中 live）
  // 开赛不在赛程 CTA；唯一入口为 M 面板本轮管理
  var showEditGroups = flags.canManageGroups;
  var editGroupsLabel = hasGroups ? '修改分组' : '开始分组';
  var blockMessage = '';
  if (isRegistering && !hasGroups) {
    blockMessage = '请先完成本轮分组';
  }

  return attachRoundDock(
    {
      ok: true,
      selectedKey: selectedKey,
      roundSelectorItems: items,
      panelMode: panelMode,
      matchId: asString(match && match.matchId),
      gameMode: gameMode,
      stationStatusLabel: asString(gate.stationStatusLabel),
      canEnterRound: true,
      blockReason: '',
      blockMessage: '',
      matchLifecycle: life,
      groupCards: groupCards,
      teeGroups: teeGroups,
      hasGroups: hasGroups,
      // 只读快照：编辑 sheet 由页面自行 clone；此处不暴露 detail navUrl
      groupsSnapshot: deepClone(Array.isArray(match && match.groups) ? match.groups : []),
      strokeCompositionMode: strokeCompositionMode,
      showCompositionMode: showCompositionMode,
      showCompositionPreview: showCompositionPreview,
      cta: {
        showEditGroups: showEditGroups,
        editGroupsLabel: editGroupsLabel,
        blockMessage: blockMessage
      }
    },
    src.roundStates,
    series
  );
}

module.exports = {
  buildScheduleRoundSelector: buildScheduleRoundSelector,
  buildSeriesScheduleViewModel: buildSeriesScheduleViewModel,
  emptyScheduleViewModel: emptyScheduleViewModel,
  hasNonEmptyGroup: hasNonEmptyGroup,
  roundHasFormalGroups: roundHasFormalGroups,
  findEarliestPriorUngroupedRound: findEarliestPriorUngroupedRound,
  isScheduleRoundCancelled: isScheduleRoundCancelled,
  projectGroupCards: projectGroupCards,
  projectTeeGroups: projectTeeGroups,
  cardProjectionSignature: tournamentGroupCardView.cardProjectionSignature
};
