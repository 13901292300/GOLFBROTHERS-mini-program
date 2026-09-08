'use strict';

/**
 * 创建流程选俱乐部队：默认「我的球队 ∪ 我创建过的比赛用过的队」。
 * 全局搜索本阶段只预留空结果，不走 snapshot includes。
 */

var SOURCE_MY = 'my_team';
var SOURCE_USED = 'used_team';

function asId(value) {
  return String(value == null ? '' : value).trim();
}

function asTime(value) {
  var n = Number(value || 0);
  return isFinite(n) ? n : 0;
}

function pickLogo(name, explicit) {
  var url = String(explicit || '').trim();
  if (url) return url;
  try {
    return require('../mockAvatars.js').pickMockAvatar(name || 'team');
  } catch (e) {
    return '';
  }
}

function baseCard(id) {
  return {
    teamId: id,
    id: id,
    name: '',
    shortName: '',
    logo: '',
    metaText: '',
    organizationType: 'team',
    source: SOURCE_USED,
    isMyTeam: false,
    lastUsedAt: 0
  };
}

function fromMyTeamRow(row) {
  var id = asId(row && (row.id || row.teamId));
  if (!id) return null;
  if (String((row && row.organizationType) || '') === 'event_org') return null;
  var name = String((row && (row.fullName || row.name)) || '').trim();
  var logo = String((row && row.logo) || '').trim();
  return {
    teamId: id,
    id: id,
    name: name,
    shortName: String((row && row.shortName) || '').trim(),
    logo: pickLogo(name || id, logo),
    metaText: String((row && row.metaText) || '').trim(),
    organizationType: 'team',
    source: SOURCE_MY,
    isMyTeam: true,
    lastUsedAt: 0,
    role: (row && (row.role || row.currentUserRole)) || ''
  };
}

function peekClub(teamId, peekFn) {
  try {
    var peeked = typeof peekFn === 'function' ? peekFn(teamId) : require('./access.js').peekTeam(teamId);
    if (!peeked) return null;
    if (String(peeked.organizationType || '') === 'event_org') return null;
    return peeked;
  } catch (e) {
    return null;
  }
}

function applyPeek(card, peeked) {
  if (!card || !peeked) return card;
  if (!card.name && peeked.name) card.name = String(peeked.name);
  if (!card.shortName && peeked.shortName) card.shortName = String(peeked.shortName);
  if (!card.logo && peeked.logo) card.logo = String(peeked.logo);
  return card;
}

function applyHistorySnap(card, snap) {
  if (!card || !snap) return card;
  if (!card.name && snap.name) card.name = String(snap.name);
  if (!card.shortName && snap.shortName) card.shortName = String(snap.shortName);
  if (!card.logo && snap.logo) card.logo = String(snap.logo);
  card.lastUsedAt = Math.max(asTime(card.lastUsedAt), asTime(snap.lastUsedAt));
  return card;
}

function mergeCards(keep, incoming) {
  if (!keep) return incoming;
  if (!incoming) return keep;
  var my = !!(keep.isMyTeam || incoming.isMyTeam);
  var primary = keep.isMyTeam ? keep : incoming.isMyTeam ? incoming : keep;
  var other = primary === keep ? incoming : keep;
  var out = Object.assign({}, other, primary);
  out.teamId = keep.teamId;
  out.id = keep.id;
  out.isMyTeam = my;
  out.source = my ? SOURCE_MY : SOURCE_USED;
  out.lastUsedAt = Math.max(asTime(keep.lastUsedAt), asTime(incoming.lastUsedAt));
  if (!out.name) out.name = other.name || primary.name || '';
  if (!out.shortName) out.shortName = other.shortName || primary.shortName || '';
  if (!out.logo) out.logo = other.logo || primary.logo || '';
  out.logo = pickLogo(out.name || out.teamId, out.logo);
  return out;
}

function matchUsedAt(match) {
  return asTime((match && (match.updatedAt || match.createdAt)) || 0);
}

function collectHistorySnaps(deps) {
  var out = [];
  var matches = [];
  try {
    matches =
      (typeof deps.listMatches === 'function'
        ? deps.listMatches()
        : require('../teamMatchStore.js').listMatches()) || [];
  } catch (e) {
    return out;
  }
  var actor = {};
  try {
    actor =
      typeof deps.getCurrentUser === 'function'
        ? deps.getCurrentUser() || {}
        : require('../gameStore.js').getCurrentUser() || {};
  } catch (e2) {
    actor = {};
  }
  var matchManageAccess = deps.matchManageAccess;
  var isInternal = deps.isInternal;
  var isInter = deps.isInter;
  matches.forEach(function (match) {
    if (!match) return;
    var isMine = false;
    try {
      isMine = !!(matchManageAccess && matchManageAccess.isCreatorOfMatch(match, actor));
    } catch (e3) {
      isMine = false;
    }
    if (!isMine) return;
    var usedAt = matchUsedAt(match);
    if (isInter(match)) {
      (match.teamGroups || []).forEach(function (g) {
        var id = asId(g && g.sourceTeamId);
        if (!id) return;
        out.push({
          teamId: id,
          name: String((g && (g.sourceTeamName || g.name)) || '').trim(),
          shortName: String((g && (g.sourceTeamShortName || g.name)) || '').trim(),
          logo: String((g && g.sourceTeamLogo) || '').trim(),
          lastUsedAt: usedAt
        });
      });
      return;
    }
    if (isInternal(match)) {
      var tid = asId(match.teamId);
      if (!tid) return;
      out.push({
        teamId: tid,
        name: String((match.teamName || match.name) || '').trim(),
        shortName: String(match.shortName || '').trim(),
        logo: String((match.teamLogo || match.matchLogo) || '').trim(),
        lastUsedAt: usedAt
      });
    }
  });
  return out;
}

function listTeamsForCreateDefault(options) {
  var opts = options || {};
  var listMy =
    typeof opts.listMyTeams === 'function'
      ? opts.listMyTeams
      : function () {
          return Promise.resolve({ ok: false, list: [] });
        };
  return Promise.resolve()
    .then(function () {
      return listMy();
    })
    .catch(function () {
      return { ok: false, list: [] };
    })
    .then(function (mineRes) {
      var mineList = mineRes && mineRes.ok ? mineRes.list || [] : [];
      var byId = {};
      var myOrder = [];
      mineList.forEach(function (row) {
        var card = fromMyTeamRow(row);
        if (!card) return;
        byId[card.teamId] = card;
        myOrder.push(card.teamId);
      });

      var history = [];
      try {
        var matchManageAccess =
          opts.matchManageAccess || require('../matchManageAccess.js');
        var caps = opts.caps || require('../teamMatchCapabilities.js');
        history = collectHistorySnaps({
          listMatches: opts.listMatches,
          getCurrentUser: opts.getCurrentUser,
          matchManageAccess: matchManageAccess,
          isInternal: caps.isTeamInternalMatch,
          isInter: caps.isInterTeamMatch
        });
      } catch (eHist) {
        history = [];
      }

      var usedOrder = [];
      history.forEach(function (snap) {
        var id = asId(snap && snap.teamId);
        if (!id) return;
        var peeked = peekClub(id, opts.peekTeam);
        var incoming = baseCard(id);
        incoming.source = SOURCE_USED;
        incoming.isMyTeam = false;
        applyPeek(incoming, peeked);
        applyHistorySnap(incoming, snap);
        incoming.logo = pickLogo(incoming.name || id, incoming.logo);
        if (byId[id]) {
          byId[id] = mergeCards(byId[id], incoming);
          return;
        }
        byId[id] = incoming;
        usedOrder.push(id);
      });

      usedOrder.sort(function (a, b) {
        var da = asTime(byId[a] && byId[a].lastUsedAt);
        var db = asTime(byId[b] && byId[b].lastUsedAt);
        if (db !== da) return db - da;
        return 0;
      });

      var list = myOrder
        .concat(usedOrder)
        .map(function (id) {
          return byId[id];
        })
        .filter(Boolean);
      return { ok: true, list: list };
    });
}

function searchTeamsForCreate(keyword) {
  var q = String(keyword || '').trim();
  if (!q) {
    return Promise.resolve({ ok: true, list: [], implemented: false });
  }
  return Promise.resolve({ ok: true, list: [], implemented: true });
}

module.exports = {
  SOURCE_MY: SOURCE_MY,
  SOURCE_USED: SOURCE_USED,
  listTeamsForCreateDefault: listTeamsForCreateDefault,
  searchTeamsForCreate: searchTeamsForCreate
};
