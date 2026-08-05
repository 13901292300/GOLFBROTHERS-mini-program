const matchJoinQrAccess = require('../../../utils/matchJoinQrAccess.js');
const matchJoinIdentity = require('../../../utils/matchJoinIdentity.js');
const teamMatchStore = require('../../../utils/teamMatchStore.js');
const userIdentityAlias = require('../../../utils/userIdentityAlias.js');
const gameStore = require('../../../utils/gameStore.js');
const matchStateUtil = require('../../../utils/matchState.js');
const {
  isG5MatchPlayMode,
  isG6G7MatchPlayMode,
  isG8MatchPlayMode
} = require('../../../utils/strokeEntityValidator.js');

const PENDING_BIND_KEY = 'gb_match_join_pending_bind_v1';

function safeDecode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch (e) {
    return raw;
  }
}

function isExpired(access) {
  return !!(access && access.expiresAt > 0 && access.expiresAt < Date.now());
}

function resolveCanonicalUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) return '';
  try {
    return String(userIdentityAlias.resolveCanonicalUserId(id) || id).trim() || id;
  } catch (e) {
    return id;
  }
}

function isSameUserIdentity(leftUserId, rightUserId) {
  const left = String(leftUserId || '').trim();
  const right = String(rightUserId || '').trim();
  if (!left || !right) return false;
  if (left === right) return true;
  return resolveCanonicalUserId(left) === resolveCanonicalUserId(right);
}

/**
 * Patch-02C3A / G6–G8 Phase1-A：进记分页 mode 分流（与 detail / score 对齐）
 * 1) G1 / G5 / G6/G7/G8 比洞 → individual_stroke（禁止残留 scoreEntities 抢路）
 * 2) scoreEntities[groupId] 非空 → stroke_entity
 * 3) G2/G3/G4 比杆 gameMode → stroke_entity
 * 4) 否则 individual_stroke
 */
function resolveTournamentScorePageMode(match, groupId) {
  const gameMode = String(
    (match && (match.gameMode || match.selectedGameMode)) || ''
  ).trim();
  if (gameMode === '个人比杆赛' || isG5MatchPlayMode(gameMode)) {
    return 'individual_stroke';
  }
  if (isG6G7MatchPlayMode(gameMode) || isG8MatchPlayMode(gameMode)) {
    return 'individual_stroke';
  }
  const gid = groupId != null ? String(groupId) : '';
  const scoreEntities = match && match.scoreEntities;
  if (scoreEntities && typeof scoreEntities === 'object' && !Array.isArray(scoreEntities)) {
    const list = Array.isArray(scoreEntities[gid]) ? scoreEntities[gid] : [];
    if (list.length > 0) return 'stroke_entity';
    return 'individual_stroke';
  }
  if (
    gameMode === '最好成绩比杆赛' ||
    gameMode === '四人四球比杆赛' ||
    gameMode === '最佳球位比杆赛' ||
    gameMode === '四人两球比杆赛'
  ) {
    return 'stroke_entity';
  }
  return 'individual_stroke';
}

function resolveMatchName(match, matchId) {
  if (!match) return matchId || '未知赛事';
  const roundName = String(match.roundName || '').trim();
  if (roundName) return roundName;
  const organizationName = String(match.organizationName || '').trim();
  const teamName = String(match.teamName || '').trim();
  if (organizationName || teamName) return [organizationName, teamName].filter(Boolean).join(' · ');
  return String(match.courseName || matchId || '未知赛事').trim();
}

function resolveGroupName(match, groupId) {
  const gid = String(groupId || '').trim();
  if (!gid || !match) return '';
  const groups = Array.isArray(match.groups) ? match.groups : [];
  const group = groups.find((item) => String(item && (item.groupId || item.id)) === gid);
  if (group) {
    return String(group.groupName || group.name || '').trim();
  }
  return '';
}

function resolveGroup(match, groupId) {
  const gid = String(groupId || '').trim();
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  return groups.find((item) => String(item && (item.groupId || item.id)) === gid) || null;
}

function buildRegisterLookup(match) {
  const out = {};
  const users = match && match.registerInfo && Array.isArray(match.registerInfo.users)
    ? match.registerInfo.users
    : [];
  users.forEach((user) => {
    const id = user && (user.userId || user.playerId || user.id);
    if (!id) return;
    out[String(id)] = user;
  });
  return out;
}

function resolvePlayerName(user) {
  const raw = user || {};
  return String(
    raw.matchNickname ||
    raw.competitionName ||
    raw.nickname ||
    raw.name ||
    raw.userId ||
    raw.playerId ||
    ''
  ).trim();
}

Page({
  data: {
    token: '',
    status: 'loading',
    message: '正在识别二维码',
    matchName: '',
    matchId: '',
    groupName: '',
    groupId: '',
    joinSubmitting: false,
    joinResultStatus: '',
    teamGroupSheetVisible: false,
    teamGroupOptions: []
  },

  onLoad(options) {
    const token = safeDecode((options && (options.joinToken || options.token)) || '');
    this.setData({ token: token });
    this.resolveJoinAccess(token);
  },

  resolveJoinAccess(token) {
    if (!token) {
      console.log('[match-join-flow]', {
        stage: 'token_parse',
        token: '',
        ok: false,
        reason: 'no_token'
      });
      this.showInvalid('二维码无效');
      return;
    }
    const access = matchJoinQrAccess.getJoinAccess(token);
    if (!access) {
      console.log('[match-join-flow]', {
        stage: 'token_parse',
        token: token,
        ok: false,
        reason: 'not_found'
      });
      this.showInvalid('二维码无效');
      return;
    }
    if (access.status !== 'active') {
      console.log('[match-join-flow]', {
        stage: 'token_parse',
        token: token,
        ok: false,
        reason: 'status_' + access.status,
        matchId: access.matchId || '',
        groupId: access.groupId || ''
      });
      this.showInvalid('二维码不可使用');
      return;
    }
    if (isExpired(access)) {
      console.log('[match-join-flow]', {
        stage: 'token_parse',
        token: token,
        ok: false,
        reason: 'expired',
        matchId: access.matchId || '',
        groupId: access.groupId || ''
      });
      this.showInvalid('二维码已过期');
      return;
    }

    const match = teamMatchStore.getMatchById(access.matchId);
    if (!match) {
      console.log('[match-join-flow]', {
        stage: 'token_parse',
        token: token,
        ok: false,
        reason: 'match_not_found',
        matchId: access.matchId || '',
        groupId: access.groupId || ''
      });
      this.showInvalid('二维码无效');
      return;
    }
    console.log('[match-join-flow]', {
      stage: 'token_parse',
      token: token,
      ok: true,
      matchId: access.matchId || '',
      groupId: access.groupId || ''
    });

    this.setData({
      status: 'ready',
      message: '请确认加入信息',
      matchName: resolveMatchName(match, access.matchId),
      matchId: access.matchId,
      groupName: resolveGroupName(match, access.groupId) || '未命名分组',
      groupId: access.groupId,
      joinResultStatus: ''
    });
    this._joinAccess = access;
  },

  showInvalid(message) {
    this.setData({
      status: 'error',
      message: message || '二维码无效',
      matchName: '',
      matchId: '',
      groupName: '',
      groupId: '',
      joinSubmitting: false,
      joinResultStatus: '',
      teamGroupSheetVisible: false,
      teamGroupOptions: []
    });
    this._joinAccess = null;
    this._pendingJoinUser = null;
  },

  findRegisteredUser(match, userId) {
    const users = match && match.registerInfo && Array.isArray(match.registerInfo.users)
      ? match.registerInfo.users
      : [];
    return users.find((item) => {
      const id = item && (item.userId || item.playerId || item.id);
      return isSameUserIdentity(id, userId);
    }) || null;
  },

  resolveTeamGroupOptions(match) {
    const groups = match && Array.isArray(match.teamGroups) ? match.teamGroups : [];
    return groups
      .map((group, index) => {
        const id = group && group.id != null ? String(group.id).trim() : '';
        const name = group && group.name ? String(group.name).trim() : '';
        return {
          id: id,
          name: name || ('分队' + (index + 1))
        };
      })
      .filter((group) => group.id);
  },

  resolveTargetGroupCapacity(match, groupId) {
    const gid = String(groupId || '').trim();
    const groups = match && Array.isArray(match.groups) ? match.groups : [];
    const group = groups.find((item) => String(item && (item.groupId || item.id)) === gid);
    if (!group) {
      return {
        exists: false,
        currentCount: 0,
        emptyCount: 0,
        hasAvailableSlot: false
      };
    }
    const slots = teamMatchStore.resolveGroupSlots(group);
    let currentCount = 0;
    slots.forEach((slot) => {
      if (teamMatchStore.resolveSlotPlayer(slot)) currentCount += 1;
    });
    const emptyCount = Math.max(0, slots.length - currentCount);
    return {
      exists: true,
      currentCount: currentCount,
      emptyCount: emptyCount,
      hasAvailableSlot: emptyCount > 0
    };
  },

  buildScoreMatchState(match, groupId) {
    const group = resolveGroup(match, groupId);
    const lookup = buildRegisterLookup(match);
    const players = teamMatchStore.resolveGroupSlots(group).map((slot) => {
      const slotPlayer = teamMatchStore.resolveSlotPlayer(slot);
      const playerId = slotPlayer && (slotPlayer.userId || slotPlayer.playerId);
      if (!playerId) return null;
      const user = lookup[playerId] || {};
      return {
        playerId: playerId,
        name: resolvePlayerName(user) || playerId,
        avatar: user.avatar || ''
      };
    }).filter(Boolean);
    const mode = resolveTournamentScorePageMode(match, groupId);
    return {
      mode: mode,
      formatType: 'individual_stroke',
      gameId: '',
      matchId: match.matchId || '',
      groupIndex: 0,
      groupId: groupId,
      players: players,
      course: {
        courseId: match.courseId || '',
        courseName: match.courseName || '',
        courseLocation: match.courseLocation || '',
        halfText: match.courseHalfText || '',
        roundName: match.roundName || match.courseName || '',
        front9Course: match.front9Course || null,
        back9Course: match.back9Course || null
      },
      scores: matchStateUtil.emptyScores(),
      groupCount: Array.isArray(match.groups) ? Math.max(1, match.groups.length) : 1
    };
  },

  navigateToScoreForSlot(match, access, user, teamGroup) {
    const groupId = access && access.groupId ? String(access.groupId) : '';
    if (!match || !groupId || !user || !user.userId) return false;
    const player = {
      userId: user.userId,
      playerId: user.userId,
      name: user.competitionName || user.nickname || user.userId,
      matchNickname: user.competitionName || user.nickname || '',
      nickname: user.nickname || '',
      competitionName: user.competitionName || '',
      avatar: user.avatar || '',
      phone: user.phone || '',
      gender: user.gender || '',
      userType: user.userType || '',
      identitySource: user.identitySource || '',
      source: 'scan'
    };
    try {
      wx.setStorageSync(PENDING_BIND_KEY, {
        token: access.token || '',
        matchId: match.matchId || access.matchId || '',
        groupId: groupId,
        player: player,
        teamGroup: teamGroup || null,
        createdAt: Date.now()
      });
    } catch (e) {
      return false;
    }
    console.log('[match-join-flow]', {
      stage: 'pending_bind_create',
      matchId: match.matchId || access.matchId || '',
      groupId: groupId,
      slotId: '',
      userId: user.userId || ''
    });
    matchStateUtil.setMatchState(this.buildScoreMatchState(match, groupId));
    wx.redirectTo({
      url: '/subpackages/scoring/pages/score/index?joinToken=' + encodeURIComponent(access.token || ''),
      fail: () => {
        wx.navigateTo({
          url: '/subpackages/scoring/pages/score/index?joinToken=' + encodeURIComponent(access.token || '')
        });
      }
    });
    return true;
  },

  onJoinTap() {
    if (this.data.status !== 'ready' || this.data.joinSubmitting) return;
    const access = this._joinAccess || matchJoinQrAccess.getJoinAccess(this.data.token);
    if (!access) {
      this.showInvalid('二维码无效');
      return;
    }
    const match = teamMatchStore.getMatchById(access.matchId);
    if (!match) {
      this.showInvalid('二维码无效');
      return;
    }

    this.setData({ joinSubmitting: true });
    const identity = matchJoinIdentity.resolveJoinIdentity({
      currentUser: gameStore.getCurrentUser(),
      joinAccess: access
    });
    console.log('[match-join-flow]', {
      stage: 'identity_resolve',
      ok: !!(identity && identity.ok),
      reason: identity && identity.reason ? identity.reason : '',
      userId: identity && identity.user ? identity.user.userId || '' : '',
      userType: identity && identity.user ? identity.user.userType || '' : '',
      identitySource: identity && identity.user ? identity.user.identitySource || '' : ''
    });
    if (!identity || !identity.ok) {
      this.setData({ joinSubmitting: false });
      if (identity && identity.needBindPhone) {
        wx.showToast({ title: '请先绑定手机号', icon: 'none' });
      } else {
        wx.showToast({ title: '无法识别用户身份', icon: 'none' });
      }
      return;
    }

    const user = identity.user || {};
    if (this.findRegisteredUser(match, user.userId)) {
      console.log('[match-join-flow]', {
        stage: 'register_check',
        result: 'already_registered',
        userId: user.userId || '',
        matchId: match.matchId || '',
        groupId: access.groupId || ''
      });
      const capacity = this.resolveTargetGroupCapacity(match, access.groupId);
      if (capacity.hasAvailableSlot) {
        this.navigateToScoreForSlot(match, access, user, null);
        return;
      }
      this.setData({
        status: 'already_registered',
        message: '你已报名本场比赛，本组暂无空位',
        joinSubmitting: false,
        joinResultStatus: 'already_registered'
      });
      return;
    }

    const teamGroups = this.resolveTeamGroupOptions(match);
    if (!teamGroups.length) {
      this.setData({ joinSubmitting: false });
      wx.showToast({ title: '赛事分队缺失', icon: 'none' });
      return;
    }

    this._pendingJoinUser = user;
    this.setData({
      teamGroupSheetVisible: true,
      teamGroupOptions: teamGroups,
      joinSubmitting: false
    });
  },

  closeTeamGroupSheet() {
    this._pendingJoinUser = null;
    this.setData({
      teamGroupSheetVisible: false,
      teamGroupOptions: [],
      joinSubmitting: false
    });
  },

  onTeamGroupSelect(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const teamGroupId = String(dataset.id || '').trim();
    const teamGroupName = String(dataset.name || '').trim();
    const user = this._pendingJoinUser;
    if (!user || !teamGroupId) {
      this.closeTeamGroupSheet();
      return;
    }
    this.commitScanRegister(user, {
      id: teamGroupId,
      name: teamGroupName
    });
  },

  commitScanRegister(user, teamGroup) {
    const access = this._joinAccess || matchJoinQrAccess.getJoinAccess(this.data.token);
    const match = access ? teamMatchStore.getMatchById(access.matchId) : null;
    if (!match) {
      this.closeTeamGroupSheet();
      this.showInvalid('二维码无效');
      return;
    }
    if (this.findRegisteredUser(match, user.userId)) {
      console.log('[match-join-flow]', {
        stage: 'register_check',
        result: 'already_registered',
        userId: user.userId || '',
        matchId: match.matchId || '',
        groupId: access.groupId || ''
      });
      this.closeTeamGroupSheet();
      this.setData({
        status: 'already_registered',
        message: '你已报名本场比赛',
        joinResultStatus: 'already_registered'
      });
      return;
    }

    if (!match.registerInfo || typeof match.registerInfo !== 'object') {
      match.registerInfo = teamMatchStore.createDefaultRegisterInfo();
    }
    if (!Array.isArray(match.registerInfo.users)) {
      match.registerInfo.users = [];
    }

    const capacity = this.resolveTargetGroupCapacity(match, access.groupId);
    const joinStatus = capacity.hasAvailableSlot ? '' : 'waiting_slot';
    console.log('[match-join-flow]', {
      stage: 'register_check',
      result: 'new_register',
      userId: user.userId || '',
      matchId: match.matchId || '',
      groupId: access.groupId || '',
      currentCount: capacity.currentCount,
      emptyCount: capacity.emptyCount,
      joinStatus: joinStatus || ''
    });

    const rawUser = {
      userId: user.userId,
      userType: user.userType,
      identitySource: user.identitySource,
      phone: user.phone,
      nickname: user.nickname,
      competitionName: user.competitionName || user.nickname,
      matchNickname: user.competitionName || user.nickname,
      avatar: user.avatar,
      gender: user.gender,
      groupId: teamGroup.id,
      groupName: teamGroup.name,
      matchTeamId: teamGroup.id,
      matchTeamName: teamGroup.name,
      source: 'scan',
      joinStatus: joinStatus,
      registeredAt: Date.now()
    };
    const normalized = teamMatchStore.normalizeRegisterUser(rawUser);
    // normalizeRegisterUser 当前会收敛 source 枚举；扫码报名在本页面保持 scan 语义。
    normalized.source = 'scan';
    if (joinStatus) normalized.joinStatus = joinStatus;
    match.registerInfo.users.push(normalized);
    match.registerInfo.totalCount = match.registerInfo.users.length;
    teamMatchStore.saveMatch(match);

    const waitingSlot = joinStatus === 'waiting_slot';
    if (!waitingSlot) {
      this._pendingJoinUser = null;
      this.setData({
        teamGroupSheetVisible: false,
        teamGroupOptions: [],
        joinSubmitting: false
      });
      this.navigateToScoreForSlot(match, access, user, teamGroup);
      return;
    }
    this._pendingJoinUser = null;
    this.setData({
      status: 'registered',
      message: waitingSlot
        ? '报名成功，本组暂无空位'
        : '报名成功，等待管理员安排出场',
      joinResultStatus: waitingSlot ? 'waiting_slot' : 'registered',
      teamGroupSheetVisible: false,
      teamGroupOptions: [],
      joinSubmitting: false
    });
    if (waitingSlot) {
      wx.showModal({
        title: '报名成功',
        content: '本组没有空位，请让本组注册用户或管理员帮助您处理。',
        showCancel: false,
        confirmText: '知道了'
      });
    } else {
      wx.showToast({ title: '报名成功', icon: 'success' });
    }
  },

  onBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/home/index' });
      }
    });
  }
});
