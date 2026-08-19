/**
 * 球队赛只读分组卡/出发表卡纯投影（权威口径对齐 detail 出发表）
 *
 * 字段链路（与 detail 一致）：
 * - 出发时间：group.teeTime|tee_time|startTime|time → resolveGroupTeeTime
 *             回退 match.teeTime|startTime|… → resolveMatchTeeTime
 *             → formatTeeMetaLine → teeMetaLine
 * - 状态：matchStatus.getMatchStatus(group, {source:'match', scoreData}) → statusBadge (UPCOMING|LIVE|COMPLETED)
 * - T 台：seat.tPosition|tee (+ gender 回退，同 hydrateGroupDisplayPlayers / tPosition.resolve)
 * - 球队/分队标签：seat.matchTeamId / seriesParticipantId / 名称快照 → teamGroups / Series.participants
 * - 昵称/头像/性别：席位快照 + lookup
 *
 * 不写 storage；不改 match。
 */

var teeSheetManage = require('../../../utils/teeSheetManage.js');
var matchStatus = require('../../../utils/matchStatus.js');
var playerManage = require('../../../utils/playerManage.js');
var tPosition = require('../../../utils/tPosition.js');
var mockAvatars = require('../../../utils/mockAvatars.js');
var { isTeamMatchFamily } = require('../../../utils/teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveUserId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  var id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

function resolveSeatDisplayName(raw, lookupEntry) {
  var src = lookupEntry || {};
  var p = raw || {};
  return (
    playerManage.resolveMatchNickname(p) ||
    asString(p.displayName) ||
    asString(p.competitionName) ||
    asString(p.name) ||
    asString(p.nickName) ||
    asString(p.nickname) ||
    asString(p.nameSnapshot) ||
    asString(p.playerNameSnapshot) ||
    asString(src.displayName) ||
    asString(src.nickname) ||
    asString(src.name) ||
    '未知球员'
  );
}

function indexSeriesParticipants(series) {
  var byId = Object.create(null);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i] || {};
    var sid = asString(part.seriesParticipantId);
    if (!sid) continue;
    var shortName = asString(part.shortNameSnapshot);
    var fullName =
      asString(part.nameSnapshot) || asString(part.fullNameSnapshot) || '';
    byId[sid] = {
      // organization：简称优先；team 分队通常无简称，回退全称
      name: shortName || fullName || sid,
      shortName: shortName,
      fullName: fullName,
      color: asString(part.colorSnapshot),
      teamGroupId:
        asString(part.sourceTeamId) ||
        asString(part.divisionId) ||
        sid.replace(/^division:/, '') ||
        sid
    };
  }
  return byId;
}

/**
 * 标签优先级（不依赖空 registerInfo）：
 * 1) seriesParticipantId → Series.participants（简称→全称）
 * 2) 合法 matchTeamId → teamGroups
 * 3) 席位 participant 名称/简称快照
 * 4) 无合法归属 → 空
 */
function resolveTeamLabel(raw, match, series) {
  var p = raw || {};
  var participantById = indexSeriesParticipants(series);
  var sid = asString(p.seriesParticipantId);
  if (sid && participantById[sid]) {
    return playerManage.formatTeamTagName(participantById[sid].name);
  }
  var teamGroups = Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
  var teamId = asString(p.matchTeamId) || asString(p.affiliationId);
  if (teamId) {
    var fromTeam = playerManage.resolveAvatarTeamLabel(
      {
        matchTeamId: teamId,
        groupId: teamId,
        matchTeamName:
          asString(p.participantShortNameSnapshot) ||
          asString(p.matchTeamName) ||
          asString(p.participantNameSnapshot),
        groupName: asString(p.groupName)
      },
      teamGroups
    );
    if (fromTeam) return fromTeam;
  }
  var gid = asString(p.groupId);
  if (gid && participantById[gid]) {
    return playerManage.formatTeamTagName(participantById[gid].name);
  }
  if (gid && gid !== sid) {
    var fromGid = playerManage.resolveAvatarTeamLabel(
      {
        matchTeamId: gid,
        groupId: gid,
        matchTeamName:
          asString(p.participantShortNameSnapshot) || asString(p.matchTeamName)
      },
      teamGroups
    );
    if (fromGid) return fromGid;
  }
  var nameFallback =
    asString(p.participantShortNameSnapshot) ||
    asString(p.participantNameSnapshot) ||
    asString(p.shortNameSnapshot) ||
    asString(p.matchTeamName) ||
    asString(p.groupName) ||
    asString(p.teamGroupName) ||
    asString(p.teamName);
  if (nameFallback) return playerManage.formatTeamTagName(nameFallback);
  return '';
}

function buildPlayerLookupFromMatch(match) {
  var map = Object.create(null);
  var users =
    match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var id = resolveUserId(u);
    if (!id || map[id]) continue;
    map[id] = u;
  }
  return map;
}

function shouldShowTeamLabel(match, series) {
  if (isTeamMatchFamily(match)) {
    var tg = Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
    if (tg.length >= 1) return true;
  }
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  return parts.length > 0;
}

function hydrateDisplayPlayers(group, match, series, playerLookup) {
  var lookup = playerLookup || {};
  var showTeam = shouldShowTeamLabel(match, series);
  var slots = Array.isArray(group && group.players) ? group.players.slice() : [];
  slots.sort(function (a, b) {
    return (Number(a && a.position) || 0) - (Number(b && b.position) || 0);
  });
  var out = [];
  for (var i = 0; i < slots.length; i++) {
    var p = slots[i];
    var userId = resolveUserId(p);
    if (!userId) continue;
    var src = lookup[userId] || {};
    var genderDisplay = playerManage.getGenderDisplay(Object.assign({}, src, p));
    // 仅用席位/lookup 可解析性别；不调用 playerDirectory 默认 male（避免空席伪造蓝T）
    var genderNorm = genderDisplay.gender || '';
    // 与 detail.hydrateGroupDisplayPlayers 同口径：显式 tPosition/tee 优先，再按规范化性别默认；
    // 无 tee 且无性别时不伪造 BLUE_T。
    var hasExplicitTee =
      p.tPosition === tPosition.RED_T ||
      p.tPosition === tPosition.BLUE_T ||
      p.tee === tPosition.RED_T ||
      p.tee === tPosition.BLUE_T;
    var teeCode = '';
    if (hasExplicitTee) {
      teeCode = tPosition.resolve({
        tPosition: p.tPosition,
        tee: p.tee,
        gender: genderNorm
      });
    } else if (genderNorm === 'male' || genderNorm === 'female') {
      teeCode = tPosition.resolve({ gender: genderNorm });
    }
    var teeText =
      teeCode === tPosition.RED_T ? '红T' : teeCode === tPosition.BLUE_T ? '蓝T' : '';
    var gender = genderNorm || asString(p.gender) || asString(src.gender);
    var displayName = resolveSeatDisplayName(p, src);
    var avatarSrc =
      asString(src.avatar) ||
      asString(src.avatarUrl) ||
      asString(p.avatar) ||
      asString(p.avatarUrl);
    out.push({
      playerId: userId,
      userId: userId,
      slotIndex: Number(p.position) || out.length + 1,
      position: Number(p.position) || out.length + 1,
      nickname: displayName,
      name: displayName,
      displayName: displayName,
      avatar: mockAvatars.resolveAvatar(avatarSrc, userId),
      gender: gender,
      genderIcon: genderDisplay.icon || '',
      genderClass: genderDisplay.className || '',
      genderSymbol: genderDisplay.icon || '',
      tee: teeText,
      teeText: teeText,
      teeLabel: teeText,
      teeCode: teeCode,
      tPosition: teeCode,
      teeMarkerClass:
        teeCode === tPosition.RED_T
          ? 'tee-marker-dot--female'
          : teeCode === tPosition.BLUE_T
            ? 'tee-marker-dot--male'
            : '',
      teamLabel: showTeam ? resolveTeamLabel(p, match, series) : '',
      seriesParticipantId: asString(p.seriesParticipantId),
      matchTeamId: asString(p.matchTeamId) || asString(p.affiliationId)
    });
  }
  return out;
}

/**
 * 构建与 detail 出发表同形的只读分组卡列表
 * @returns {Array<{
 *   groupId, id, badge, name, teeTime, startHole, teeMetaLine, hasTeeInfo,
 *   statusBadge, statusKey, matchStatus,
 *   displayPlayers, hasDisplayPlayers, players
 * }>}
 */
function buildReadonlyGroupCards(match, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!match || !Array.isArray(match.groups) || !match.groups.length) return [];
  var series = opts.series || null;
  var playerLookup = opts.playerLookup || buildPlayerLookupFromMatch(match);
  var matchTeeTime = teeSheetManage.resolveMatchTeeTime(match);
  var scoreData = match.scoreData || opts.scoreData || null;

  return match.groups.map(function (g, index) {
    var groupId =
      g && g.groupId != null && String(g.groupId).trim() !== ''
        ? String(g.groupId).trim()
        : 'group-' + (index + 1);
    var groupName =
      (g && g.groupName) || (g && g.name) || '第' + (index + 1) + '组';
    var teeTime = teeSheetManage.resolveGroupTeeTime(g) || matchTeeTime;
    var startHole = teeSheetManage.resolveGroupStartHole(g);
    var teeMetaLine = teeSheetManage.formatTeeMetaLine(teeTime, startHole);
    var ms = matchStatus.getMatchStatus(g, {
      source: 'match',
      scoreData: scoreData
    });
    var displayPlayers = hydrateDisplayPlayers(g, match, series, playerLookup);
    return {
      groupId: groupId,
      id: groupId,
      badge: String(groupName),
      name: String(groupName),
      groupName: String(groupName),
      teeTime: teeTime || '',
      startHole: startHole,
      teeMetaLine: teeMetaLine,
      hasTeeInfo: !!(teeTime || startHole != null),
      statusBadge: (ms && ms.statusBadge) || matchStatus.UPCOMING,
      statusKey: (ms && ms.statusKey) || 'upcoming',
      matchStatus: (ms && ms.status) || matchStatus.UPCOMING,
      displayPlayers: displayPlayers,
      hasDisplayPlayers: displayPlayers.length > 0,
      // 出发表 WXML 历史字段名
      players: displayPlayers
    };
  });
}

/**
 * 展示签名：与分组卡可见字段对齐（头像外：昵称 / 标签 / T 台 / meta）
 * 不含 genderIcon——分组卡不渲染性别符号（数据层仍可保留 gender）
 */
function cardProjectionSignature(cards) {
  return (Array.isArray(cards) ? cards : []).map(function (c) {
    return {
      groupId: c.groupId,
      badge: c.badge,
      teeMetaLine: c.teeMetaLine,
      statusBadge: c.statusBadge,
      players: (c.displayPlayers || c.players || []).map(function (p) {
        return {
          userId: p.userId,
          displayName: p.displayName,
          teeText: p.teeText || p.tee || '',
          teeCode: p.teeCode || p.tPosition || '',
          teamLabel: p.teamLabel || ''
        };
      })
    };
  });
}

module.exports = {
  buildReadonlyGroupCards: buildReadonlyGroupCards,
  hydrateDisplayPlayers: hydrateDisplayPlayers,
  resolveTeamLabel: resolveTeamLabel,
  cardProjectionSignature: cardProjectionSignature,
  shouldShowTeamLabel: shouldShowTeamLabel
};
