/**
 * Series 替他人报名 · 纯投影（无写入）
 * - 人员来源选项 / roster→好友页 registerUsers / 归属选项
 * - 不依赖 matchId；归属键为 seriesParticipantId
 */

var SERIES_REGISTER_FOR_OTHER_SOURCE_OPTIONS = [
  { key: 'friends', glyph: '👥', label: '从好友列表选择', desc: '选择微信好友或历史联系人' },
  {
    key: 'team_members',
    glyph: '🏌️',
    label: '从球队成员列表选择',
    desc: '选择本赛事参赛球队成员',
    disabled: true,
    locked: true
  },
  { key: 'manual', glyph: '✏️', label: '手工添加', desc: '输入姓名和手机号添加人员' }
];

var SERIES_REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST =
  '仅赛事管理员或参赛球队成员可使用';

function asString(v) {
  return v == null ? '' : String(v).trim();
}

function normalizeGenderSnapshot(raw) {
  var g = asString(raw);
  if (g === 'female' || g === '女') return '女';
  if (g === 'male' || g === '男') return '男';
  return g;
}

/**
 * @param {object} series
 * @param {boolean} canTeamMembers
 */
function buildRegisterForOtherSourceOptions(canTeamMembers) {
  var allow = !!canTeamMembers;
  return SERIES_REGISTER_FOR_OTHER_SOURCE_OPTIONS.map(function (opt) {
    if (opt.key === 'team_members') {
      return Object.assign({}, opt, { disabled: !allow, locked: !allow });
    }
    return Object.assign({}, opt, { disabled: false, locked: false });
  });
}

/**
 * Series.roster → 好友/成员页所需 registerUsers 形态（只读投影）
 */
function buildProxyRegisterUsersFromRoster(series) {
  var roster = Array.isArray(series && series.roster) ? series.roster : [];
  var out = [];
  for (var i = 0; i < roster.length; i++) {
    var e = roster[i];
    if (!e) continue;
    if (asString(e.registrationStatus) !== 'registered') continue;
    var userId = asString(e.playerId);
    if (!userId) continue;
    var genderNorm = normalizeGenderSnapshot(e.genderSnapshot);
    var genderIcon = '';
    var genderClass = '';
    if (genderNorm === '男') {
      genderIcon = '♂';
      genderClass = 'gender-male';
    } else if (genderNorm === '女') {
      genderIcon = '♀';
      genderClass = 'gender-female';
    }
    out.push({
      userId: userId,
      playerId: userId,
      competitionName: asString(e.playerNameSnapshot),
      name: asString(e.playerNameSnapshot),
      displayName: asString(e.playerNameSnapshot),
      avatar: asString(e.playerAvatarSnapshot),
      avatarUrl: asString(e.playerAvatarSnapshot),
      gender: genderNorm,
      genderIcon: genderIcon,
      genderClass: genderClass,
      phone: asString(e.phoneSnapshot),
      handicap: e.handicapSnapshot != null ? e.handicapSnapshot : '',
      handicapFloat:
        e.floatCoefSnapshot != null
          ? e.floatCoefSnapshot
          : e.handicapSnapshot != null
            ? e.handicapSnapshot
            : '',
      floatCoef: e.floatCoefSnapshot != null ? e.floatCoefSnapshot : '',
      seriesParticipantId: asString(e.seriesParticipantId),
      registrationStatus: asString(e.registrationStatus),
      registrationSource: asString(e.registrationSource) || 'self',
      groupId: asString(e.seriesParticipantId),
      matchTeamId: asString(e.seriesParticipantId),
      source: asString(e.registrationSource) || 'self',
      registeredBy: asString(e.registeredByUserId),
      registeredByName: asString(e.registeredByNameSnapshot),
      subjectType: 'other',
      pickChannel: asString(e.registrationSource) === 'proxy' ? 'friends' : '',
      canSelfCancel: true,
      locked: false
    });
  }
  return out;
}

/**
 * 归属选项：仅当前 Series.participants；id = seriesParticipantId
 * @param {object} series
 * @param {string} [defaultLogo]
 */
function buildProxyAffiliationOptions(series, defaultLogo) {
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  var hostMode = asString(series && series.hostMode);
  var fallbackLogo = asString(defaultLogo);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p) continue;
    var id = asString(p.seriesParticipantId);
    if (!id) continue;
    var name =
      asString(p.shortNameSnapshot) ||
      asString(p.nameSnapshot) ||
      asString(p.fullNameSnapshot) ||
      id;
    var logo = asString(p.logoSnapshot) || fallbackLogo;
    out.push({
      id: id,
      name: name,
      logo: logo,
      sourceTeamId: asString(p.sourceTeamId)
    });
  }
  return {
    options: out,
    hostMode: hostMode,
    fieldLabel: hostMode === 'team' ? '报名分队' : '报名球队',
    sheetTitle: hostMode === 'team' ? '选择报名分队' : '选择报名球队',
    sheetSub:
      hostMode === 'team'
        ? '本次选择的选手将统一报名到同一个分队'
        : '本次选择的选手将统一报名到同一个球队'
  };
}

/**
 * 队际组织 Series：成员来源选项（筛成员用；id 仍为 seriesParticipantId）
 */
function buildProxyMemberSourceOptions(series, defaultLogo) {
  var built = buildProxyAffiliationOptions(series, defaultLogo);
  var out = [];
  var seen = Object.create(null);
  for (var i = 0; i < built.options.length; i++) {
    var opt = built.options[i];
    var sourceTeamId = asString(opt.sourceTeamId);
    if (!sourceTeamId || seen[sourceTeamId]) continue;
    seen[sourceTeamId] = true;
    out.push({
      id: opt.id,
      name: opt.name,
      logo: opt.logo,
      sourceTeamId: sourceTeamId
    });
  }
  return out;
}

/** team Series 的通讯录 teamId */
function resolveSeriesHostTeamId(series) {
  var host = series && series.hostTeam && typeof series.hostTeam === 'object' ? series.hostTeam : {};
  var id = asString(host.teamId);
  if (id) return id;
  var parts = Array.isArray(series && series.participants) ? series.participants : [];
  for (var i = 0; i < parts.length; i++) {
    var sid = asString(parts[i] && parts[i].sourceTeamId);
    if (sid) return sid;
  }
  return '';
}

/**
 * 将选人结果规范为 registerForOther 的 player 载荷
 */
function mapPickerPlayerToProxyPayload(player, pickChannel) {
  var p = player && typeof player === 'object' ? player : {};
  var channel =
    pickChannel === 'manual' || pickChannel === 'team_members' ? pickChannel : 'friends';
  var userId = asString(p.userId) || asString(p.playerId);
  var name =
    asString(p.competitionName) ||
    asString(p.name) ||
    asString(p.realName) ||
    asString(p.nickname);
  var phone = asString(p.phone);
  return {
    playerId: userId,
    userId: userId,
    competitionName: name,
    playerNameSnapshot: name,
    avatar: asString(p.avatar) || asString(p.avatarUrl),
    playerAvatarSnapshot: asString(p.avatar) || asString(p.avatarUrl),
    gender: normalizeGenderSnapshot(p.gender),
    genderSnapshot: normalizeGenderSnapshot(p.gender),
    handicap: p.handicap != null && p.handicap !== '' ? p.handicap : '',
    handicapSnapshot: p.handicap != null && p.handicap !== '' ? p.handicap : '',
    floatCoef: p.floatCoef != null && p.floatCoef !== '' ? p.floatCoef : '',
    floatCoefSnapshot: p.floatCoef != null && p.floatCoef !== '' ? p.floatCoef : '',
    phone: phone,
    phoneSnapshot: phone,
    pickChannel: channel
  };
}

module.exports = {
  SERIES_REGISTER_FOR_OTHER_SOURCE_OPTIONS: SERIES_REGISTER_FOR_OTHER_SOURCE_OPTIONS,
  SERIES_REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST:
    SERIES_REGISTER_FOR_OTHER_TEAM_MEMBERS_DENIED_TOAST,
  normalizeGenderSnapshot: normalizeGenderSnapshot,
  buildRegisterForOtherSourceOptions: buildRegisterForOtherSourceOptions,
  buildProxyRegisterUsersFromRoster: buildProxyRegisterUsersFromRoster,
  buildProxyAffiliationOptions: buildProxyAffiliationOptions,
  buildProxyMemberSourceOptions: buildProxyMemberSourceOptions,
  resolveSeriesHostTeamId: resolveSeriesHostTeamId,
  mapPickerPlayerToProxyPayload: mapPickerPlayerToProxyPayload
};
