/**
 * PGA 风格成绩卡（横屏）
 * ?gameId= 普通球局 → gameStore
 * ?matchId= 球队赛 → teamMatchStore + statisticsAdapter
 */
const gameStore = require('../../../../utils/gameStore.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const groupsStore = require('../../../../utils/groupsStore.js');
const playerManage = require('../../../../utils/playerManage.js');
const mockAvatars = require('../../../../utils/mockAvatars.js');
const matchStatus = require('../../../../utils/matchStatus.js');
const statisticsAdapter = require('../../utils/statisticsAdapter.js');
const { computeLandscapeHeaderMetrics } = require('../../utils/landscapeHeaderMetrics.js');
const {
  resolveGameMode,
  isMatchPlayBoardMode
} = require('../../../../utils/strokeEntityValidator.js');

const HOLE_COUNT = 18;
const DEFAULT_PARS = [4, 4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 5, 4, 3, 4, 3, 4, 5];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function isFilledScore(score) {
  if (typeof matchStatus.isFilledScore === 'function') {
    return matchStatus.isFilledScore(score) && !Number.isNaN(Number(score));
  }
  return score !== null && score !== undefined && score !== '' && !Number.isNaN(Number(score));
}

function pad18(list) {
  const out = [];
  for (let i = 0; i < HOLE_COUNT; i += 1) {
    out.push(Array.isArray(list) ? list[i] : null);
  }
  return out;
}

function sumRange(values, from, to) {
  let sum = 0;
  let any = false;
  for (let i = from; i <= to; i += 1) {
    if (!isFilledScore(values[i])) continue;
    sum += Number(values[i]);
    any = true;
  }
  return any ? sum : '';
}

function holeCell(score, par) {
  if (!isFilledScore(score)) return { text: '', mark: '' };
  const num = Number(score);
  const parNum = Number(par);
  const diff = Number.isFinite(parNum) ? num - parNum : 0;
  const status = groupsStore.getScoreStatus(diff);
  let mark = 'par';
  if (status === 'eagle') mark = 'eagle';
  else if (status === 'birdie') mark = 'birdie';
  else if (status === 'bogey') mark = 'bogey';
  else if (status === 'double-bogey') mark = 'double-bogey';
  return { text: String(num), mark: mark };
}

function formatToParDiff(toPar) {
  if (toPar === null || toPar === undefined || toPar === '') return '';
  const n = Number(toPar);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'E';
  if (n > 0) return '+' + n;
  return String(n);
}

function resolveToPar(meta, scores, pars) {
  if (meta && meta.toPar != null && meta.toPar !== '') {
    const n = Number(meta.toPar);
    if (Number.isFinite(n)) return n;
  }
  const scoreArr = pad18(scores);
  const parArr = pad18(pars);
  let toPar = 0;
  let any = false;
  for (let i = 0; i < HOLE_COUNT; i += 1) {
    if (!isFilledScore(scoreArr[i])) continue;
    const parNum = Number(parArr[i]);
    toPar += Number(scoreArr[i]) - (Number.isFinite(parNum) ? parNum : 0);
    any = true;
  }
  return any ? toPar : null;
}

function firstLetter(name) {
  const s = String(name || '').trim();
  return s ? s.charAt(0) : '?';
}

function hasAvatarUrl(src) {
  const s = String(src || '').trim();
  if (!s) return false;
  if (s === 'undefined' || s === 'null') return false;
  return true;
}

function formatDateTime(ts) {
  const n = Number(ts);
  const d = Number.isFinite(n) && n > 0 ? new Date(n) : new Date();
  const mon = MONTHS[d.getMonth()] || '';
  const day = d.getDate();
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return mon + ' ' + day + ', ' + year + ' • ' + hh + ':' + mm;
}

function buildCourseLine(src) {
  const course = String((src && (src.courseName || src.course)) || '').trim();
  const front = String((src && src.front9Course) || '').trim();
  const back = String((src && src.back9Course) || '').trim();
  const half = String((src && (src.courseHalfText || src.courseHalf)) || '').trim();
  let extra = '';
  if (front || back) extra = ' • Course ' + [front, back].filter(Boolean).join('&');
  else if (half) extra = ' • ' + half;
  return (course || 'GOLF COURSE') + extra;
}

function getGroupScoreData(match, groupId) {
  const scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : null;
  const gid = groupId != null ? String(groupId).trim() : '';
  if (!scoreData || !gid) return null;
  const groupScoreData = scoreData[gid];
  return groupScoreData && typeof groupScoreData === 'object' ? groupScoreData : null;
}

function listGameGroups(game) {
  if (!game) return [];
  if (Array.isArray(game.groups) && game.groups.length) return game.groups;
  return [{
    groupId: (game.gameId || 'legacy') + '-g1',
    playersSlots: Array.isArray(game.playersSlots) ? game.playersSlots : [],
    scoresByPlayer: game.scoresByPlayer && typeof game.scoresByPlayer === 'object' ? game.scoresByPlayer : {}
  }];
}

function buildRowFromScores(meta, scores, pars) {
  const scoreArr = pad18(scores);
  const parArr = pad18(pars);
  const front = [];
  const back = [];
  for (let i = 0; i < 9; i += 1) front.push(holeCell(scoreArr[i], parArr[i]));
  for (let i = 9; i < 18; i += 1) back.push(holeCell(scoreArr[i], parArr[i]));
  const out = sumRange(scoreArr, 0, 8);
  const inn = sumRange(scoreArr, 9, 17);
  const total = sumRange(scoreArr, 0, 17);
  const name = meta.name || '未知球员';
  const avatar = meta.avatar || '';
  const tee = statisticsAdapter.resolveTeeFields
    ? statisticsAdapter.resolveTeeFields(meta)
    : { teeClass: '', teeLabel: '', teeMarkerClass: '' };
  const toPar = resolveToPar(meta, scores, pars);
  const diffText = formatToParDiff(toPar);
  return {
    id: meta.id,
    name: name,
    avatar: avatar,
    hasAvatar: hasAvatarUrl(avatar),
    initial: firstLetter(name),
    live: !!meta.live,
    toPar: toPar,
    diffText: diffText,
    diffUnder: toPar != null && Number(toPar) < 0,
    teeClass: tee.teeClass || '',
    teeLabel: tee.teeLabel || '',
    teeMarkerClass: tee.teeMarkerClass || '',
    front: front,
    back: back,
    out: out === '' ? '' : String(out),
    in: inn === '' ? '' : String(inn),
    total: total === '' ? '' : String(total)
  };
}

function measureHeaderSafeArea() {
  return computeLandscapeHeaderMetrics();
}

Page({
  data: {
    headerPadY: 6,
    headerPadRight: 96,
    headerInnerH: 32,
    headerChrome: 46,
    themeClass: 'bright-mode',
    matchId: '',
    gameId: '',
    courseLine: '',
    eventName: 'Official Scorecard',
    datetimeLine: '',
    holeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    backHoleNumbers: [10, 11, 12, 13, 14, 15, 16, 17, 18],
    frontPars: DEFAULT_PARS.slice(0, 9),
    backPars: DEFAULT_PARS.slice(9),
    outPar: 36,
    inPar: 36,
    totalPar: 72,
    rows: []
  },

  onLoad(options) {
    const opts = options || {};
    const matchId = opts.matchId ? String(opts.matchId) : '';
    const gameId = opts.gameId ? String(opts.gameId) : '';
    const loaded = this._loadScorecard(opts);
    this.setData(Object.assign({
      matchId: matchId,
      gameId: gameId,
      themeClass: this._resolveThemeClass()
    }, measureHeaderSafeArea(), loaded));
    this._applyPageBackground();
    this._bindWindowResize();
    this._lockLandscape();
  },

  onShow() {
    const themeClass = this._resolveThemeClass();
    if (themeClass !== this.data.themeClass) this.setData({ themeClass: themeClass });
    this._applyPageBackground();
    this._lockLandscape();
  },

  onHide() {
    this._restorePortrait();
  },

  onUnload() {
    this._unbindWindowResize();
    this._restorePortrait();
  },

  _loadScorecard(options) {
    const opts = options || {};
    const matchId = opts.matchId != null ? String(opts.matchId).trim() : '';
    const gameId = opts.gameId != null ? String(opts.gameId).trim() : '';

    if (matchId) {
      const match = teamMatchStore.getMatchById(matchId);
      if (match) return this._buildFromMatch(match);
    }
    if (gameId) {
      const game = typeof gameStore.getGame === 'function'
        ? gameStore.getGame(gameId)
        : (typeof gameStore.getGameById === 'function' ? gameStore.getGameById(gameId) : null);
      if (game) return this._buildFromGame(game);
    }
    return this._emptyView();
  },

  _emptyView() {
    const pars = DEFAULT_PARS.slice();
    return {
      courseLine: 'GOLF COURSE',
      eventName: 'Official Scorecard',
      datetimeLine: formatDateTime(Date.now()),
      frontPars: pars.slice(0, 9),
      backPars: pars.slice(9),
      outPar: sumRange(pars, 0, 8) || 36,
      inPar: sumRange(pars, 9, 17) || 36,
      totalPar: sumRange(pars, 0, 17) || 72,
      rows: []
    };
  },

  _metaFromSource(src) {
    const pars = statisticsAdapter.resolveMatchHolePars
      ? pad18(statisticsAdapter.resolveMatchHolePars(src) || DEFAULT_PARS)
      : DEFAULT_PARS.slice();
    const outPar = sumRange(pars, 0, 8);
    const inPar = sumRange(pars, 9, 17);
    const totalPar = sumRange(pars, 0, 17);
    return {
      courseLine: buildCourseLine(src),
      eventName: String(src.roundName || src.title || src.name || 'Official Scorecard').trim() || 'Official Scorecard',
      datetimeLine: formatDateTime(src.startAt || src.teeTime || src.createdAt || src.updatedAt),
      frontPars: pars.slice(0, 9),
      backPars: pars.slice(9),
      outPar: outPar === '' ? '' : outPar,
      inPar: inPar === '' ? '' : inPar,
      totalPar: totalPar === '' ? '' : totalPar,
      pars: pars
    };
  },

  _buildFromGame(game) {
    const meta = this._metaFromSource(game);
    const rows = [];
    const seen = {};
    listGameGroups(game).forEach((group) => {
      const scoresByPlayer =
        group && group.scoresByPlayer && typeof group.scoresByPlayer === 'object'
          ? group.scoresByPlayer
          : {};
      const slots = Array.isArray(group && group.playersSlots) ? group.playersSlots : [];
      slots.forEach((slot) => {
        if (!slot || typeof slot !== 'object') return;
        const playerId = statisticsAdapter.resolveAnyPlayerId(slot);
        if (!playerId || seen[playerId]) return;
        seen[playerId] = true;
        const record = statisticsAdapter.resolveScoresByPlayerRecord(scoresByPlayer, slot, playerId);
        const scores = record && Array.isArray(record.scores) ? record.scores : [];
        const name =
          (typeof playerManage.resolveMatchNickname === 'function'
            ? playerManage.resolveMatchNickname(slot)
            : '') ||
          slot.name ||
          '未知球员';
        const gender =
          (typeof playerManage.getGenderDisplay === 'function'
            ? (playerManage.getGenderDisplay(slot).gender || '')
            : '') ||
          slot.gender ||
          '';
        rows.push(buildRowFromScores({
          id: playerId,
          name: name,
          avatar: mockAvatars.resolveAvatar(slot.avatar || slot.avatarUrl || '', playerId),
          live: group && group.status === 'in_progress',
          gender: gender,
          teeColor: slot.teeColor,
          tPosition: slot.tPosition,
          tee: slot.tee,
          toPar: slot.toPar
        }, scores, meta.pars));
      });
    });
    return Object.assign({}, meta, { rows: rows });
  },

  _buildFromMatch(match) {
    const meta = this._metaFromSource(match);
    const isMatchPlay = isMatchPlayBoardMode(resolveGameMode(match));
    const useEntity = !isMatchPlay && statisticsAdapter.shouldUseEntityStatistics(match);
    const rows = useEntity
      ? this._rowsFromEntityMatch(match, meta.pars)
      : this._rowsFromPersonalMatch(match, meta.pars);
    return Object.assign({}, meta, { rows: rows });
  },

  _rowsFromPersonalMatch(match, pars) {
    const rows = [];
    const seen = {};
    const groups = Array.isArray(match.groups) ? match.groups : [];
    groups.forEach((group) => {
      const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
      const groupScoreData = getGroupScoreData(match, groupId);
      const scoresByPlayer =
        groupScoreData && groupScoreData.scoresByPlayer && typeof groupScoreData.scoresByPlayer === 'object'
          ? groupScoreData.scoresByPlayer
          : {};
      const players = Array.isArray(group && group.players) ? group.players : [];
      players.forEach((player) => {
        const playerId = statisticsAdapter.resolveAnyPlayerId(player);
        if (!playerId || seen[playerId]) return;
        seen[playerId] = true;
        const record = statisticsAdapter.resolveScoresByPlayerRecord(scoresByPlayer, player, playerId);
        const scores = record && Array.isArray(record.scores) ? record.scores : [];
        const name =
          (typeof playerManage.resolveMatchNickname === 'function'
            ? playerManage.resolveMatchNickname(player)
            : '') ||
          player.name ||
          player.nickname ||
          '未知球员';
        const gender =
          (typeof playerManage.getGenderDisplay === 'function'
            ? (playerManage.getGenderDisplay(player).gender || '')
            : '') ||
          player.gender ||
          '';
        rows.push(buildRowFromScores({
          id: playerId,
          name: name,
          avatar: mockAvatars.resolveAvatar(player.avatar || player.avatarUrl || '', playerId),
          live: false,
          gender: gender,
          teeColor: player.teeColor,
          tPosition: player.tPosition,
          tee: player.tee,
          toPar: player.toPar
        }, scores, pars));
      });
    });
    return rows;
  },

  _rowsFromEntityMatch(match, pars) {
    const adapterRows = statisticsAdapter.buildEntityStatisticsRows(match) || [];
    return adapterRows.map((row) => {
      const groupScoreData = getGroupScoreData(match, row.groupId);
      const list = Array.isArray(groupScoreData && groupScoreData.teamScoresByEntity)
        ? groupScoreData.teamScoresByEntity
        : [];
      let scores = [];
      for (let i = 0; i < list.length; i += 1) {
        const rec = list[i];
        const key = rec && (rec.teamId || rec.entityId);
        if (String(key) === String(row.entityId)) {
          scores = Array.isArray(rec.scores) ? rec.scores : [];
          break;
        }
      }
      return buildRowFromScores({
        id: row.entityId || row.playerId,
        name: row.name,
        avatar: row.avatar,
        live: false,
        gender: row.gender,
        teeColor: row.teeColor,
        tPosition: row.tPosition || row.tee,
        tee: row.tee,
        toPar: row.toPar
      }, scores, pars);
    });
  },

  _resolveThemeClass() {
    try {
      const app = getApp();
      const theme = app && typeof app.getTheme === 'function' ? app.getTheme() : 'light';
      return theme === 'dark' ? 'dark-mode' : 'bright-mode';
    } catch (e) {
      return 'bright-mode';
    }
  },

  _applyPageBackground() {
    const dark = this._resolveThemeClass() === 'dark-mode';
    if (typeof wx.setBackgroundColor === 'function') {
      wx.setBackgroundColor({
        backgroundColor: dark ? '#000000' : '#f0f2f5',
        backgroundColorTop: dark ? '#000000' : '#f0f2f5',
        backgroundColorBottom: dark ? '#000000' : '#ffffff'
      });
    }
  },

  _syncHeaderSafeArea() {
    const next = measureHeaderSafeArea();
    if (
      this.data.headerPadY === next.headerPadY &&
      this.data.headerPadRight === next.headerPadRight &&
      this.data.headerInnerH === next.headerInnerH &&
      this.data.headerChrome === next.headerChrome
    ) {
      return;
    }
    this.setData(next);
  },

  _bindWindowResize() {
    if (this._onWindowResize) return;
    this._onWindowResize = () => {
      this._syncHeaderSafeArea();
    };
    if (typeof wx.onWindowResize === 'function') {
      wx.onWindowResize(this._onWindowResize);
    }
  },

  _unbindWindowResize() {
    if (this._onWindowResize && typeof wx.offWindowResize === 'function') {
      wx.offWindowResize(this._onWindowResize);
    }
    this._onWindowResize = null;
  },

  _lockLandscape() {
    const sync = () => {
      this._syncHeaderSafeArea();
      setTimeout(() => this._syncHeaderSafeArea(), 80);
    };
    if (typeof wx.setPageOrientation !== 'function') {
      sync();
      return;
    }
    wx.setPageOrientation({
      orientation: 'landscape',
      complete: sync
    });
  },

  _restorePortrait(done) {
    const finish = typeof done === 'function' ? done : null;
    if (typeof wx.setPageOrientation !== 'function') {
      if (finish) finish();
      return;
    }
    wx.setPageOrientation({
      orientation: 'portrait',
      complete: () => {
        if (finish) finish();
      }
    });
  },

  onBack() {
    this._restorePortrait(() => {
      wx.navigateBack({
        fail: () => {
          wx.reLaunch({ url: '/pages/home/index' });
        }
      });
    });
  }
});
