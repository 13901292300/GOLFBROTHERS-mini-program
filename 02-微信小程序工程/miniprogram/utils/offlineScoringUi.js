/**
 * 离线记分展示文案。不写 session。
 */

const offlineScoringState = require('./offlineScoringState.js');

function scoreViewMode(snapshot, context) {
  var snap = snapshot && snapshot.mode != null ? snapshot : offlineScoringState.get();
  if (offlineScoringState.matchesContext(snap.session, context)) return snap.mode;
  return offlineScoringState.MODE_ONLINE;
}

function scorePillText(mode) {
  if (mode === offlineScoringState.MODE_OFFLINE) return '离线记分';
  if (mode === offlineScoringState.MODE_SYNCING) return '正在同步';
  if (mode === offlineScoringState.MODE_SYNC_FAILED) return '成绩待同步';
  return '';
}

function scorePillVisible(snapshot, context) {
  return !!scorePillText(scoreViewMode(snapshot, context));
}

function homeBannerText(mode) {
  if (mode === offlineScoringState.MODE_OFFLINE) return '离线记分中';
  if (mode === offlineScoringState.MODE_SYNCING) return '正在同步成绩…';
  if (mode === offlineScoringState.MODE_SYNC_FAILED) return '部分成绩尚未同步';
  return '';
}

function homeShouldShowBanner(snapshot) {
  var snap = snapshot && snapshot.mode != null ? snapshot : offlineScoringState.get();
  return !!(snap.session && offlineScoringState.isActiveMode(snap.mode));
}

function modeLabel(mode) {
  if (mode === offlineScoringState.MODE_OFFLINE) return '离线记分';
  if (mode === offlineScoringState.MODE_SYNCING) return '正在同步';
  if (mode === offlineScoringState.MODE_SYNC_FAILED) return '待同步';
  return '在线';
}

function buildStatusDetail(input) {
  var src = input && typeof input === 'object' ? input : {};
  var connected = src.networkConnected !== false;
  var snap = src.snapshot || offlineScoringState.get();
  var session = snap.session;
  var mode = snap.mode || offlineScoringState.MODE_ONLINE;
  return {
    networkText: connected ? '已连接' : '未连接',
    modeText: modeLabel(mode),
    roundName: (session && session.title) || src.roundName || '',
    canRetry: mode === offlineScoringState.MODE_SYNC_FAILED && connected
  };
}

function resolveScoreContext(page) {
  if (!page) return null;
  var data = page.data || {};
  var ms = page._matchState || {};
  var gameId = String(data.gameId || ms.gameId || '').trim();
  var matchId = String(ms.matchId || '').trim();
  var title =
    (data.gameContext && data.gameContext.title) ||
    (data.match && (data.match.roundName || data.match.course)) ||
    '';
  if (typeof page._isGameStoreContext === 'function' && page._isGameStoreContext()) {
    if (!gameId) return null;
    return { contextType: 'game', contextId: gameId, title: String(title || '') };
  }
  if (matchId) {
    return { contextType: 'teamMatch', contextId: matchId, title: String(title || '') };
  }
  if (gameId) {
    return { contextType: 'game', contextId: gameId, title: String(title || '') };
  }
  return null;
}

module.exports = {
  scoreViewMode: scoreViewMode,
  scorePillText: scorePillText,
  scorePillVisible: scorePillVisible,
  homeBannerText: homeBannerText,
  homeShouldShowBanner: homeShouldShowBanner,
  modeLabel: modeLabel,
  buildStatusDetail: buildStatusDetail,
  resolveScoreContext: resolveScoreContext
};
