/**
 * Unified user identity directory.
 *
 * This module only resolves existing user identities. It must not
 * create users, mutate profiles, write registerInfo, or update match data.
 */
const playerDirectory = require('./playerDirectory.js');
const teamDirectory = require('./teamDirectory.js');
const mockAvatars = require('./mockAvatars.js');

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').trim();
}

function normalizeUserIdentity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const userId = String(raw.userId || raw.playerId || raw.id || '').trim();
  const phone = normalizePhone(raw.phone);
  if (!userId || !phone) return null;
  const nickname = String(raw.nickname || raw.name || raw.competitionName || raw.matchNickname || userId).trim();
  const competitionName = String(raw.competitionName || raw.matchNickname || '').trim();
  return {
    userId: userId,
    phone: phone,
    nickname: nickname,
    competitionName: competitionName,
    avatar: raw.avatar || mockAvatars.resolveAvatar('', userId),
    gender: raw.gender != null ? String(raw.gender) : ''
  };
}

function resolveFromMiniProgramUserCenter(phone) {
  // Reserved for the future Mini Program backend / WeChat user center lookup.
  return null;
}

function resolveFromAppUserCenter(phone) {
  // Reserved for the future APP backend user lookup.
  return null;
}

function resolveFromMockMiniProgramFallback(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const friends = Array.isArray(playerDirectory.FRIEND_LIST)
    ? playerDirectory.FRIEND_LIST
    : [];
  const friend = friends.find((item) => normalizePhone(item && item.phone) === normalizedPhone);
  if (friend) return normalizeUserIdentity(friend);

  const teams = Array.isArray(teamDirectory.TEAMS) ? teamDirectory.TEAMS : [];
  for (let i = 0; i < teams.length; i++) {
    const members = teamDirectory.getTeamMembers(teams[i] && teams[i].id);
    const member = members.find((item) => normalizePhone(item && item.phone) === normalizedPhone);
    if (member) return normalizeUserIdentity(member);
  }
  return null;
}

function buildFoundResult(source, userType, user) {
  return {
    found: true,
    source: source,
    userType: userType,
    user: user
  };
}

function buildNotFoundResult() {
  return {
    found: false,
    source: null,
    userType: null
  };
}

function resolveUserIdentityByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return buildNotFoundResult();

  const miniProgramUser = resolveFromMiniProgramUserCenter(normalizedPhone);
  if (miniProgramUser) {
    return buildFoundResult('mini_program', 'registered', miniProgramUser);
  }

  // Mini Program mock fallback only: keeps business pages away from demo directories.
  const fallbackUser = resolveFromMockMiniProgramFallback(normalizedPhone);
  if (fallbackUser) {
    return buildFoundResult('mini_program', 'registered', fallbackUser);
  }

  const appUser = resolveFromAppUserCenter(normalizedPhone);
  if (appUser) {
    return buildFoundResult('app', 'phone', appUser);
  }

  return buildNotFoundResult();
}

function resolveRegisteredUserByPhone(phone) {
  const result = resolveUserIdentityByPhone(phone);
  if (!result.found || result.userType !== 'registered') {
    return { found: false };
  }
  return {
    found: true,
    user: result.user
  };
}

module.exports = {
  resolveUserIdentityByPhone,
  resolveRegisteredUserByPhone
};
