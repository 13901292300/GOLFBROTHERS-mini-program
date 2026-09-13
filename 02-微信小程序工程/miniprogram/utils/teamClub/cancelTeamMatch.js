'use strict';

/**
 * 球队比赛取消：云端 team_matches.status = cancelled 是事实源。
 * 不删除云文档。本地 purge 仅在云写入成功之后由调用方执行。
 */

function resolveMatchId(match) {
  return String((match && match.matchId) || '').trim();
}

function resolveTeamId(match) {
  return String((match && match.teamId) || '').trim();
}

function resolveExpectedVersion(match) {
  if (!match) return null;
  if (match.cloudVersion != null && match.cloudVersion !== '') {
    var cv = Number(match.cloudVersion);
    return isNaN(cv) ? null : cv;
  }
  if (match.version != null && match.version !== '') {
    var v = Number(match.version);
    return isNaN(v) ? null : v;
  }
  return null;
}

function failResult(code, message) {
  return {
    ok: false,
    code: code || 'error',
    message: message || '取消失败，请稍后重试',
    purged: false
  };
}

function markTeamMatchCancelled(match, putMatchFn) {
  var matchId = resolveMatchId(match);
  var teamId = resolveTeamId(match);
  if (!matchId || !teamId) {
    return Promise.resolve(failResult('invalid_args', '取消失败，请稍后重试'));
  }
  var put = putMatchFn;
  if (typeof put !== 'function') {
    put = require('./service.js').putMatch;
  }
  var opts = {
    writeKind: 'full',
    operationId: matchId + ':cancel'
  };
  var expectedVersion = resolveExpectedVersion(match);
  if (expectedVersion != null) opts.expectedVersion = expectedVersion;
  return Promise.resolve(put({ matchId: matchId, teamId: teamId, status: 'cancelled' }, opts))
    .then(function (res) {
      if (res && res.ok) return res;
      return failResult((res && (res.code || res.reason)) || 'error', '取消失败，请稍后重试');
    })
    .catch(function () {
      return failResult('network_error', '取消失败，请稍后重试');
    });
}

function confirmTeamMatchCancel(match, options) {
  var opts = options || {};
  return markTeamMatchCancelled(match, opts.putMatch).then(function (res) {
    if (!res || !res.ok) {
      return failResult((res && res.code) || 'error', (res && res.message) || '取消失败，请稍后重试');
    }
    var matchId = resolveMatchId(match);
    if (typeof opts.deleteSchedules === 'function') {
      try {
        opts.deleteSchedules(matchId);
      } catch (eSched) {
        /* 日程清理失败不得回滚已成功的云端 cancelled */
      }
    }
    if (typeof opts.purgeLocal === 'function') {
      try {
        opts.purgeLocal(matchId);
      } catch (ePurge) {
        /* 云端已 cancelled，本地缓存清理失败仍视为取消成功 */
      }
    } else {
      try {
        require('../gameLifecycle.js').purgeTeamMatchCompletely(matchId);
      } catch (eDefault) {
        /* ignore */
      }
    }
    return { ok: true, match: res.match, purged: true };
  });
}

module.exports = {
  resolveMatchId: resolveMatchId,
  resolveTeamId: resolveTeamId,
  markTeamMatchCancelled: markTeamMatchCancelled,
  confirmTeamMatchCancel: confirmTeamMatchCancel
};
