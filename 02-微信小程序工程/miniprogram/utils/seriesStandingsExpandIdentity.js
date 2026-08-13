/**
 * Series 总榜 R 轮展开：身份区球队/分队角标解析（只读）
 *
 * 权威对齐 detail 领先榜：
 * - organization：player.badgeTeamId + teamGroupLogoById[id]（sourceTeamLogo || DEFAULT_ORG_LOGO）
 * - team（分队）：无 LOGO 时 badgeText / badgeColor（组件最小扩展；普通队内赛 avatarBadge=none 不受影响）
 *
 * 归属只读正式席位；roster 仅补齐展示字段，不得覆盖席位已有归属。
 */

var seriesResultAdapter = require('./seriesResultAdapter.js');
var playerManage = require('./playerManage.js');
var mockAvatars = require('./mockAvatars.js');
var openPlayerProfileUtil = require('./openPlayerProfile.js');
var { DEFAULT_ORG_LOGO, isTeamMatchFamily } = require('./teamMatchCapabilities.js');

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function resolveSeatPlayerId(seat) {
  if (!seat || typeof seat !== 'object') return '';
  var id =
    seat.userId != null
      ? seat.userId
      : seat.playerId != null
        ? seat.playerId
        : seat.id != null
          ? seat.id
          : seat.uid != null
            ? seat.uid
            : seat.openid;
  return id != null ? String(id).trim() : '';
}

function findFormalSeat(match, playerId) {
  var pid = asString(playerId);
  if (!pid || !match) return null;
  var groups = Array.isArray(match.groups) ? match.groups : [];
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    if (!group) continue;
    var lists = [];
    if (Array.isArray(group.players)) lists.push(group.players);
    if (Array.isArray(group.playersSlots)) lists.push(group.playersSlots);
    for (var li = 0; li < lists.length; li++) {
      var list = lists[li];
      for (var i = 0; i < list.length; i++) {
        var seat = list[i];
        if (resolveSeatPlayerId(seat) === pid) {
          return {
            seat: seat,
            groupId: group.groupId != null ? asString(group.groupId) : ''
          };
        }
      }
    }
  }
  return null;
}

function indexParticipants(series) {
  var byId = Object.create(null);
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p !== 'object') continue;
    var sid = asString(p.seriesParticipantId);
    if (!sid) continue;
    byId[sid] = p;
  }
  return byId;
}

function listTeamGroups(match) {
  return Array.isArray(match && match.teamGroups) ? match.teamGroups : [];
}

/**
 * 将席位归属键解析为 teamGroups[].id（不得默认第一队）
 */
function resolveTeamGroupId(match, series, seat, seriesParticipantId) {
  var tgs = listTeamGroups(match);
  if (!tgs.length) return '';
  var partById = indexParticipants(series);
  var part = seriesParticipantId ? partById[seriesParticipantId] : null;
  var affRaw = asString(seat && seat.matchTeamId) || asString(seat && seat.affiliationId);
  var candidates = [
    affRaw,
    asString(seriesParticipantId),
    part ? asString(part.sourceTeamId) : '',
    part ? asString(part.divisionId) : '',
    affRaw ? affRaw.replace(/^team:/, '') : '',
    affRaw ? affRaw.replace(/^division:/, '') : '',
    seriesParticipantId ? asString(seriesParticipantId).replace(/^team:/, '') : '',
    seriesParticipantId ? asString(seriesParticipantId).replace(/^division:/, '') : '',
    asString(seat && seat.groupId)
  ];
  var seen = Object.create(null);
  for (var i = 0; i < candidates.length; i++) {
    var key = candidates[i];
    if (!key || seen[key]) continue;
    seen[key] = true;
    for (var t = 0; t < tgs.length; t++) {
      var tg = tgs[t];
      var tid = asString(tg && (tg.id != null ? tg.id : tg.teamGroupId));
      if (tid && tid === key) return tid;
    }
  }
  return '';
}

/**
 * @returns {{
 *   badgeTeamId: string,
 *   badgeText: string,
 *   badgeColor: string,
 *   avatarBadge: 'team'|'none',
 *   hostMode: string,
 *   seriesParticipantId: string
 * }}
 */
function resolveExpandAffiliationBadge(match, series, playerId) {
  var empty = {
    badgeTeamId: '',
    badgeText: '',
    badgeColor: '',
    avatarBadge: 'none',
    hostMode: asString(series && series.hostMode) || '',
    seriesParticipantId: ''
  };
  var found = findFormalSeat(match, playerId);
  if (!found || !found.seat) return empty;

  var seat = found.seat;
  var hostMode = asString(series && series.hostMode) || '';
  var participantMap = seriesResultAdapter.buildParticipantResolveMap(series);
  var partById = indexParticipants(series);

  var seriesParticipantId = asString(seat.seriesParticipantId);
  if (seriesParticipantId && !participantMap[seriesParticipantId]) {
    seriesParticipantId = participantMap[seriesParticipantId] || seriesParticipantId;
  }
  if (!seriesParticipantId) {
    var aff0 = asString(seat.matchTeamId) || asString(seat.affiliationId);
    if (aff0 && participantMap[aff0]) seriesParticipantId = participantMap[aff0];
  }
  // roster 只读补齐：仅当席位完全无归属键
  if (
    !seriesParticipantId &&
    !asString(seat.matchTeamId) &&
    !asString(seat.affiliationId)
  ) {
    try {
      var strokeEntityValidator = require('./strokeEntityValidator.js');
      var teamMap = strokeEntityValidator.buildRegisterTeamMap(match) || {};
      var fromRoster = asString(teamMap[asString(playerId)]);
      if (fromRoster && participantMap[fromRoster]) {
        seriesParticipantId = participantMap[fromRoster];
      } else if (fromRoster) {
        seriesParticipantId = fromRoster;
      }
    } catch (eRoster) {
      /* ignore */
    }
  }

  var part = seriesParticipantId ? partById[seriesParticipantId] : null;
  var badgeTeamId = resolveTeamGroupId(match, series, seat, seriesParticipantId);
  if (!badgeTeamId && seriesParticipantId && participantMap[seriesParticipantId]) {
    badgeTeamId = resolveTeamGroupId(match, series, seat, participantMap[seriesParticipantId]);
  }

  // 无合法归属：不默认第一队
  if (!badgeTeamId && !part) {
    return empty;
  }

  var shortName =
    (part && (asString(part.shortNameSnapshot) || asString(part.nameSnapshot) || asString(part.fullNameSnapshot))) ||
    asString(seat.participantShortNameSnapshot) ||
    asString(seat.participantNameSnapshot) ||
    asString(seat.matchTeamName) ||
    '';
  if (!shortName && badgeTeamId) {
    var tgs = listTeamGroups(match);
    for (var i = 0; i < tgs.length; i++) {
      if (asString(tgs[i] && tgs[i].id) === badgeTeamId) {
        shortName = asString(tgs[i].name);
        break;
      }
    }
  }
  var color =
    (part && asString(part.colorSnapshot)) ||
    (function () {
      var tgs2 = listTeamGroups(match);
      for (var j = 0; j < tgs2.length; j++) {
        if (asString(tgs2[j] && tgs2[j].id) === badgeTeamId) {
          return asString(tgs2[j].colorSnapshot || tgs2[j].color);
        }
      }
      return '';
    })();

  if (hostMode === 'team') {
    // 分队：优先 LOGO（若有）；否则文字/颜色角标
    return {
      badgeTeamId: badgeTeamId,
      badgeText: playerManage.formatTeamTagName(shortName) || '',
      badgeColor: color,
      avatarBadge: badgeTeamId || shortName ? 'team' : 'none',
      hostMode: hostMode,
      seriesParticipantId: seriesParticipantId || ''
    };
  }

  // organization（及未知）：球队 LOGO 角标；无 id 不展示
  return {
    badgeTeamId: badgeTeamId,
    badgeText: '',
    badgeColor: '',
    avatarBadge: badgeTeamId ? 'team' : 'none',
    hostMode: hostMode || 'organization',
    seriesParticipantId: seriesParticipantId || ''
  };
}

/**
 * 页级 LOGO map：对齐 detail._buildTeamGroupLogoMap
 * - organization：每队 sourceTeamLogo || DEFAULT_ORG_LOGO
 * - team（分队）：仅写入非空 LOGO（无则走文字角标）
 * 同时挂 participant / sourceTeamId / divisionId 别名 → 同一 URL，避免键不一致漏显
 */
function buildStandingsTeamGroupLogoById(match, series) {
  var map = {};
  var hostMode = asString(series && series.hostMode);
  var isDivisionMode = hostMode === 'team';
  var tgs = listTeamGroups(match);
  var participantMap = seriesResultAdapter.buildParticipantResolveMap(series);

  for (var i = 0; i < tgs.length; i++) {
    var tg = tgs[i];
    if (!tg) continue;
    var id = asString(tg.id != null ? tg.id : tg.teamGroupId);
    if (!id) continue;
    var logo = asString(
      tg.sourceTeamLogo != null
        ? tg.sourceTeamLogo
        : tg.logo != null
          ? tg.logo
          : tg.logoUrl != null
            ? tg.logoUrl
            : ''
    );
    if (!logo && !isDivisionMode) logo = DEFAULT_ORG_LOGO;
    if (!logo) continue;
    map[id] = logo;

    // 别名：seriesParticipantId / sourceTeamId / divisionId
    var aliases = [id];
    if (participantMap[id]) aliases.push(participantMap[id]);
    var parts = Array.isArray(series && series.participants) ? series.participants : [];
    for (var p = 0; p < parts.length; p++) {
      var part = parts[p];
      if (!part) continue;
      var sid = asString(part.seriesParticipantId);
      var sourceTeamId = asString(part.sourceTeamId);
      var divisionId = asString(part.divisionId);
      if (id === sourceTeamId || id === divisionId || id === sid || id === sid.replace(/^team:/, '') || id === sid.replace(/^division:/, '')) {
        if (sid) aliases.push(sid);
        if (sourceTeamId) aliases.push(sourceTeamId);
        if (divisionId) aliases.push(divisionId);
        if (asString(part.logoSnapshot) && !map[id]) {
          /* keep map[id] */
        }
        // participant logo 可补空 sourceTeamLogo（organization）
        if (!isDivisionMode && asString(part.logoSnapshot)) {
          var plogo = asString(part.logoSnapshot);
          if (plogo && map[id] === DEFAULT_ORG_LOGO) map[id] = plogo;
        }
      }
    }
    for (var a = 0; a < aliases.length; a++) {
      var ak = asString(aliases[a]);
      if (ak && !map[ak]) map[ak] = map[id];
    }
  }

  return map;
}

function pickFilled(a, b) {
  var left = a == null ? '' : String(a).trim();
  if (left) return left;
  var right = b == null ? '' : String(b).trim();
  return right;
}

function formatMetricText(value) {
  if (value == null || value === '') return '--';
  var n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

function collectRegisterLookup(match) {
  var map = Object.create(null);
  var lists = [];
  var info = match && match.registerInfo;
  if (info && typeof info === 'object') {
    if (Array.isArray(info.users)) lists.push(info.users);
    if (Array.isArray(info.players)) lists.push(info.players);
  }
  if (Array.isArray(match && match.participants)) lists.push(match.participants);
  for (var i = 0; i < lists.length; i++) {
    var users = lists[i];
    for (var j = 0; j < users.length; j++) {
      var u = users[j];
      if (!u || typeof u !== 'object') continue;
      var keys = [u.userId, u.playerId, u.id, u.uid, u.openid];
      for (var k = 0; k < keys.length; k++) {
        var id = asString(keys[k]);
        if (id && !map[id]) map[id] = u;
      }
    }
  }
  return map;
}

function findRosterProfile(series, playerId) {
  var pid = asString(playerId);
  if (!pid) return null;
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  for (var i = 0; i < roster.length; i++) {
    var row = roster[i];
    if (!row || typeof row !== 'object') continue;
    var rid = asString(row.userId || row.playerId || row.id);
    if (rid && rid === pid) return row;
  }
  return null;
}

function isForbiddenProfileId(id, row) {
  var v = asString(id);
  if (!v) return true;
  var src = row && typeof row === 'object' ? row : {};
  if (v === asString(src.entityId)) return true;
  if (v === asString(src.occurrenceKey)) return true;
  if (v === asString(src.seriesParticipantId)) return true;
  if (v === asString(src.rosterEntryId)) return true;
  if (v === asString(src.scorecardKey) && asString(src.scorecardKey).indexOf(':') >= 0) {
    return true;
  }
  return false;
}

function resolveClickedPlayerId(playerRow) {
  var src = playerRow && typeof playerRow === 'object' ? playerRow : {};
  var candidates = [src.playerId, src.userId, src.profileUserId];
  var members = Array.isArray(src.memberUserIds) ? src.memberUserIds : [];
  for (var m = 0; m < members.length; m++) candidates.push(members[m]);
  for (var i = 0; i < candidates.length; i++) {
    var id = asString(candidates[i]);
    if (!id || isForbiddenProfileId(id, src)) continue;
    return id;
  }
  return '';
}

function resolveStandingsIdentityChrome(match) {
  var family = false;
  try {
    family = isTeamMatchFamily(match) === true;
  } catch (eFam) {
    family = false;
  }
  return {
    metaMode: family ? 'handicapFloat' : 'countryAge',
    showNameGender: family
  };
}

/**
 * 与 R1 身份卡同一套关注显示条件（组件不读 store）。
 * 本人不展示关注；已关注/好友回显标签；无稳定 ID 不展示按钮。
 */
function resolveStandingsFollowDisplay(opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var profileUserId = asString(o.profileUserId);
  var currentUserId = asString(o.currentUserId);
  var isSelf = false;
  if (profileUserId) {
    if (profileUserId === 'me') isSelf = true;
    if (currentUserId && profileUserId === currentUserId) isSelf = true;
  }
  var statusRaw = asString(o.relationStatus);
  var status = 'none';
  if (statusRaw === 'friend' || statusRaw === 'following' || statusRaw === 'none') {
    status = statusRaw;
  }
  var label = '';
  if (!isSelf) {
    if (status === 'friend') label = '好友';
    else if (status === 'following') label = '已关注';
  }
  return {
    followed: !isSelf && (status === 'friend' || status === 'following'),
    relationStatus: isSelf ? 'none' : status,
    relationLabel: label,
    canFollow: !!profileUserId && !isSelf,
    isSelf: isSelf
  };
}

/**
 * TOT / R 球队展开资料栏：与 R1 个人榜 identity 契约同构。
 * 只读正式席位 + 报名快照；roster 仅补缺失展示字段。
 */
function projectStandingsScorecardIdentity(match, series, playerRow) {
  var chrome = resolveStandingsIdentityChrome(match);
  var playerId = resolveClickedPlayerId(playerRow);
  var found = playerId ? findFormalSeat(match, playerId) : null;
  var seat = found && found.seat ? found.seat : null;
  var lookup = playerId ? collectRegisterLookup(match)[playerId] || {} : {};
  var roster = playerId ? findRosterProfile(series, playerId) : null;
  var src = playerRow && typeof playerRow === 'object' ? playerRow : {};

  var nameSrc = Object.assign({}, roster || {}, lookup, seat || {}, {
    competitionName:
      (seat && seat.competitionName) || lookup.competitionName || (roster && roster.competitionName),
    matchNickname:
      (seat && seat.matchNickname) || lookup.matchNickname || (roster && roster.matchNickname),
    nickname: lookup.nickname || (seat && seat.nickname) || (roster && roster.nickname),
    name: (seat && seat.name) || lookup.name || (roster && roster.name) || src.name
  });
  var name =
    playerManage.resolveMatchNickname(nameSrc) ||
    asString(src.name || src.displayName || src.nickname) ||
    playerId ||
    '球员';

  var genderMerged = Object.assign({}, roster || {}, lookup, seat || src, {
    gender:
      lookup.gender ||
      (seat && seat.gender) ||
      (roster && roster.gender) ||
      src.gender
  });
  var genderDisplay = playerManage.getGenderDisplay(genderMerged);

  var avatarRaw = pickFilled(
    lookup.avatar || lookup.avatarUrl,
    pickFilled(
      seat && (seat.avatar || seat.avatarUrl),
      pickFilled(roster && (roster.avatar || roster.avatarUrl), src.avatar || src.avatarUrl)
    )
  );
  var avatar = playerId
    ? mockAvatars.resolveAvatar(avatarRaw, playerId) || mockAvatars.pickMockAvatar(playerId || name)
    : asString(avatarRaw);

  var handicap = pickFilled(
    seat && seat.handicap,
    pickFilled(lookup.handicap, pickFilled(roster && roster.handicap, src.handicap))
  );
  var floatCoef = pickFilled(
    seat && (seat.floatCoef || seat.floatCoefficient),
    pickFilled(
      lookup.floatCoef || lookup.floatCoefficient,
      pickFilled(
        roster && (roster.floatCoef || roster.floatCoefficient),
        src.floatCoef || src.floatCoefficient
      )
    )
  );

  var aff = resolveExpandAffiliationBadge(match, series, playerId);
  var badgeTeamId = (aff && aff.badgeTeamId) || asString(src.badgeTeamId);
  var profileUserId = '';
  try {
    profileUserId = openPlayerProfileUtil.resolveOpenableUserId({
      userId: playerId,
      playerId: playerId,
      userType: src.userType
    });
  } catch (eOpen) {
    profileUserId = '';
  }
  if (profileUserId && isForbiddenProfileId(profileUserId, src)) profileUserId = '';

  var gender = (genderDisplay && genderDisplay.gender) || '';
  var genderIcon = (genderDisplay && genderDisplay.icon) || '';
  var genderClass = (genderDisplay && genderDisplay.className) || '';

  return {
    player: {
      playerId: playerId,
      userId: playerId,
      profileUserId: profileUserId,
      name: name,
      displayName: name,
      nickname: name,
      publicName: name,
      avatar: avatar,
      avatarUrl: avatar,
      gender: gender,
      genderIcon: genderIcon,
      genderSymbol: genderIcon,
      genderClass: genderClass,
      country: pickFilled(seat && seat.country, pickFilled(lookup.country, src.country)),
      age: pickFilled(seat && seat.age, pickFilled(lookup.age, src.age)),
      handicap: handicap,
      floatCoef: floatCoef,
      handicapText: formatMetricText(handicap),
      floatCoefText: formatMetricText(floatCoef),
      badgeTeamId: badgeTeamId,
      badgeText: (aff && aff.badgeText) || '',
      badgeColor: (aff && aff.badgeColor) || '',
      flag: pickFilled(seat && seat.flag, pickFilled(lookup.flag, src.flag))
    },
    avatarBadge: (aff && aff.avatarBadge) || 'none',
    metaMode: chrome.metaMode,
    showNameGender: chrome.showNameGender,
    profileUserId: profileUserId
  };
}

module.exports = {
  DEFAULT_ORG_LOGO: DEFAULT_ORG_LOGO,
  findFormalSeat: findFormalSeat,
  resolveExpandAffiliationBadge: resolveExpandAffiliationBadge,
  buildStandingsTeamGroupLogoById: buildStandingsTeamGroupLogoById,
  resolveTeamGroupId: resolveTeamGroupId,
  resolveClickedPlayerId: resolveClickedPlayerId,
  resolveStandingsIdentityChrome: resolveStandingsIdentityChrome,
  resolveStandingsFollowDisplay: resolveStandingsFollowDisplay,
  projectStandingsScorecardIdentity: projectStandingsScorecardIdentity
};
