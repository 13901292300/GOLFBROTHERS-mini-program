/**
 * 赛事统计数据页
 * - 优先 statisticsAdapter（match.scoreData）→ dataSource='adapter'
 *   G1：buildStatisticsRows（个人）；G2/G3/G4：buildEntityStatisticsRows（组合）
 *   G5–G8 Match Play：buildMatchPlayStatisticsRows（分流，builder 暂留）
 * - 普通创建：gameId → buildGameStatisticsRows（game.groups[].scoresByPlayer）
 * - 仅显式 ?mock=1 → dataSource='mock'（mockStatisticsPlayers）
 * - 无 matchId / 无 gameId / 无可用数据 → dataSource='empty'
 * - sortField/sortOrder 默认 total/asc
 */
const mockAvatars = require('../../../../utils/mockAvatars.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const gameStore = require('../../../../utils/gameStore.js');
const statisticsAdapter = require('../../utils/statisticsAdapter.js');
const {
  resolveGameMode,
  isMatchPlayBoardMode
} = require('../../../../utils/strokeEntityValidator.js');

const TEE_COLOR_TO_MARKER = {
  '#dc2626': 'border-red',
  '#ce9224': 'border-gold',
  '#ffffff': 'border-white',
  '#111827': 'border-white',
  '#00aeef': 'border-light'
};

/**
 * Mock 统计球员（仅 UI 验证）
 * 数组顺序已按 total 升序，对齐默认 sortField=total / sortOrder=asc
 */
const mockStatisticsPlayers = [
  {
    playerId: 'mock-p1',
    avatar: '',
    name: '张三',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 4,
    par: 10,
    bogey: 3,
    doublePlus: 1,
    girPercent: '72%',
    putts: 28,
    fairwayPercent: '80%',
    sand: 1,
    penalty: 0,
    stat8421: 12,
    total: 68
  },
  {
    playerId: 'mock-p2',
    avatar: '',
    name: 'Alexander Thompson',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#00aeef',
    eagle: 1,
    birdie: 5,
    par: 8,
    bogey: 3,
    doublePlus: 1,
    girPercent: '100%',
    putts: 26,
    fairwayPercent: '100%',
    sand: 0,
    penalty: 0,
    stat8421: 128,
    total: 69
  },
  {
    playerId: 'mock-p3',
    avatar: '',
    name: '王小明',
    gender: 'female',
    genderIcon: '♀',
    teeColor: '#ffffff',
    eagle: 0,
    birdie: 3,
    par: 11,
    bogey: 3,
    doublePlus: 1,
    girPercent: '55%',
    putts: 30,
    fairwayPercent: '40%',
    sand: 2,
    penalty: 1,
    stat8421: 8,
    total: 71
  },
  {
    playerId: 'mock-p4',
    avatar: '',
    name: '李四',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 2,
    par: 12,
    bogey: 3,
    doublePlus: 1,
    girPercent: '61%',
    putts: 20,
    fairwayPercent: '57%',
    sand: '-',
    penalty: 0,
    stat8421: 6,
    total: 72
  },
  {
    playerId: 'mock-p5',
    avatar: '',
    name: 'Emily Watson',
    gender: 'female',
    genderIcon: '♀',
    teeColor: '#00aeef',
    eagle: 0,
    birdie: 1,
    par: 10,
    bogey: 5,
    doublePlus: 2,
    girPercent: '44%',
    putts: 34,
    fairwayPercent: '50%',
    sand: 3,
    penalty: 2,
    stat8421: 18,
    total: 74
  },
  {
    playerId: 'mock-p6',
    avatar: '',
    name: '陈美丽',
    gender: 'female',
    genderIcon: '♀',
    teeColor: '#ffffff',
    eagle: 0,
    birdie: 2,
    par: 9,
    bogey: 5,
    doublePlus: 2,
    girPercent: '50%',
    putts: 31,
    fairwayPercent: '64%',
    sand: 1,
    penalty: 1,
    stat8421: 9,
    total: 75
  },
  {
    playerId: 'mock-p7',
    avatar: '',
    name: '赵六',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 1,
    par: 8,
    bogey: 6,
    doublePlus: 3,
    girPercent: '38%',
    putts: 36,
    fairwayPercent: '42%',
    sand: 2,
    penalty: 2,
    stat8421: 5,
    total: 78
  },
  {
    playerId: 'mock-p8',
    avatar: '',
    name: 'Christopher Johnson',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#00aeef',
    eagle: 0,
    birdie: 0,
    par: 7,
    bogey: 7,
    doublePlus: 4,
    girPercent: '33%',
    putts: 38,
    fairwayPercent: '36%',
    sand: 4,
    penalty: 3,
    stat8421: 3,
    total: 80
  },
  {
    playerId: 'mock-p9',
    avatar: '',
    name: '北京之巅',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#ffffff',
    eagle: 0,
    birdie: 0,
    par: 6,
    bogey: 8,
    doublePlus: 4,
    girPercent: '28%',
    putts: 39,
    fairwayPercent: '40%',
    sand: 5,
    penalty: 2,
    stat8421: 2,
    total: 82
  },
  {
    playerId: 'mock-p10',
    avatar: '',
    name: 'TigerHoods Jr',
    gender: 'male',
    genderIcon: '♂',
    teeColor: '#dc2626',
    eagle: 0,
    birdie: 0,
    par: 5,
    bogey: 8,
    doublePlus: 5,
    girPercent: '22%',
    putts: 40,
    fairwayPercent: '29%',
    sand: 6,
    penalty: 4,
    stat8421: 1,
    total: 85
  }
];

function resolveTeeMarkerClass(teeColor) {
  const key = String(teeColor || '').trim().toLowerCase();
  if (TEE_COLOR_TO_MARKER[key]) return TEE_COLOR_TO_MARKER[key];
  if (key === '#fff' || key === 'white') return 'border-white';
  return 'border-white';
}

function isZeroLike(value) {
  return value === 0 || value === '0' || value === '-' || value === '';
}

/**
 * 将 mock 映射为表格行（兼容现有 WXML）
 * 不在此处排序——顺序依赖 mockStatisticsPlayers 预制顺序与默认 sort 状态
 */
function mapMockPlayersToRows(players) {
  const list = Array.isArray(players) ? players : [];
  return list.map((p, index) => {
    const gender = p.gender === 'female' ? 'female' : 'male';
    const genderIcon = p.genderIcon || (gender === 'female' ? '♀' : '♂');
    const name = String(p.name || '').trim() || '未知球员';
    return {
      id: p.playerId || ('mock-' + index),
      playerId: p.playerId || ('mock-' + index),
      avatar: p.avatar || mockAvatars.pickMockAvatar(name),
      name: name,
      gender: gender,
      genderIcon: genderIcon,
      genderClass: gender === 'female' ? 'gender-female' : 'gender-male',
      teeColor: p.teeColor || '#ffffff',
      teeMarkerClass: resolveTeeMarkerClass(p.teeColor),
      eagle: p.eagle,
      birdie: p.birdie,
      par: p.par,
      bogey: p.bogey,
      doublePlus: p.doublePlus,
      girPercent: p.girPercent,
      putts: p.putts,
      fairwayPercent: p.fairwayPercent,
      sand: p.sand,
      penalty: p.penalty,
      stat8421: p.stat8421,
      total: p.total,
      eag: p.eagle,
      bir: p.birdie,
      bog: p.bogey,
      dbl: p.doublePlus,
      gir: p.girPercent,
      fwy: p.fairwayPercent,
      pen: p.penalty,
      score8421: p.stat8421,
      eagMuted: isZeroLike(p.eagle),
      birMuted: isZeroLike(p.birdie),
      sandMuted: isZeroLike(p.sand)
    };
  });
}

/**
 * 表头首次点击默认方向：desc 类 / asc 类
 * 同字段再点：asc <-> desc；换字段：重置为该字段默认方向
 */
const SORT_DEFAULT_DESC = {
  eag: true,
  bir: true,
  par: true,
  bog: true,
  gir: true,
  fwy: true,
  score8421: true
};

const SORT_DEFAULT_ASC = {
  total: true,
  putts: true,
  dbl: true,
  sand: true,
  pen: true
};

function resolveDefaultSortOrder(field) {
  const key = field != null ? String(field).trim() : '';
  if (SORT_DEFAULT_DESC[key]) return 'desc';
  if (SORT_DEFAULT_ASC[key]) return 'asc';
  return 'asc';
}

/** 排序键：'-'/空 → missing；"71%" → 71；其余 Number 或原串 */
function parseStatsSortValue(raw) {
  if (raw === '-' || raw === '' || raw == null) return { missing: true, num: null, str: '' };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { missing: true, num: null, str: '' };
    return { missing: false, num: raw, str: String(raw) };
  }
  const s = String(raw).trim();
  if (!s || s === '-') return { missing: true, num: null, str: '' };
  const pctStr = s.charAt(s.length - 1) === '%' ? s.slice(0, -1).trim() : s;
  const n = Number(pctStr);
  if (!Number.isNaN(n)) return { missing: false, num: n, str: s };
  return { missing: false, num: null, str: s };
}

Page({
  data: {
    statusBarHeight: 20,
    matchId: '',
    gameId: '',
    /** 顶栏占位：statusBarHeight + 标题条 40 + 底边 2，供 --stats-header-chrome */
    statsHeaderChrome: 62,
    themeClass: 'bright-mode',
    title: 'Player Statistics',
    subtitle: '赛事统计',
    defaultSortNote: 'TOTAL asc',
    sortField: 'total',
    sortOrder: 'asc',
    dataSource: 'empty',
    mockStatisticsPlayers: mockStatisticsPlayers,
    rows: []
  },

  onLoad(options) {
    const opts = options || {};
    const matchId = opts.matchId ? String(opts.matchId) : '';
    const gameId = opts.gameId ? String(opts.gameId) : '';
    let statusBarHeight = 20;
    try {
      const sys = wx.getSystemInfoSync();
      statusBarHeight = sys.statusBarHeight || 20;
    } catch (e) {
      statusBarHeight = 20;
    }
    const loaded = this._loadStatisticsPageRows(opts);
    this.setData({
      matchId: matchId,
      gameId: gameId,
      statusBarHeight: statusBarHeight,
      statsHeaderChrome: statusBarHeight + 42,
      themeClass: this._resolveThemeClass(),
      sortField: 'total',
      sortOrder: 'asc',
      dataSource: loaded.dataSource,
      subtitle: this._resolveStatsSubtitle(opts, loaded.dataSource),
      rows: loaded.rows
    });
    this._applyPageBackground();
    this._lockLandscape();
  },

  /** adapter / mock / empty 对应副标题（不改布局） */
  _subtitleForDataSource(dataSource) {
    if (dataSource === 'adapter') return '赛事统计 · 真实成绩';
    if (dataSource === 'mock') return '赛事统计 · Mock 预览';
    return '赛事统计 · 暂无数据';
  },

  /**
   * Series 传入 roundSubtitle（如 R1 · 第一轮）时优先展示；
   * 普通赛事仍走 dataSource 默认副标题。
   */
  _resolveStatsSubtitle(options, dataSource) {
    const opts = options || {};
    let roundSubtitle = '';
    try {
      roundSubtitle =
        opts.roundSubtitle != null
          ? decodeURIComponent(String(opts.roundSubtitle))
          : '';
    } catch (e) {
      roundSubtitle = opts.roundSubtitle != null ? String(opts.roundSubtitle) : '';
    }
    roundSubtitle = String(roundSubtitle || '').trim();
    if (roundSubtitle) return roundSubtitle;
    return this._subtitleForDataSource(dataSource);
  },

  /**
   * 开发 mock 模式：
   * - 显式 ?mock=1 / ?dataSource=mock
   * - 或 matchId 与 gameId 皆空（本地直接打开统计页预览）
   */
  _isStatsMockMode(options) {
    const opts = options || {};
    const mockFlag = opts.mock === '1' || opts.mock === 'true' || opts.dataSource === 'mock';
    if (mockFlag) return true;
    const matchId = opts.matchId != null ? String(opts.matchId).trim() : '';
    const gameId = opts.gameId != null ? String(opts.gameId).trim() : '';
    return !matchId && !gameId;
  },

  /**
   * 真实数据优先：matchId → getMatchById → buildStatisticsRows
   * 普通创建：gameId → getGame → buildGameStatisticsRows
   * 开发 mock → mockStatisticsPlayers；非 mock 无数据 → empty
   */
  _loadStatisticsPageRows(options) {
    const opts = options || {};
    const matchId = opts.matchId != null ? String(opts.matchId).trim() : '';
    const gameId = opts.gameId != null ? String(opts.gameId).trim() : '';
    const forceMock = this._isStatsMockMode(opts);

    // 显式 mock 且未带真实 matchId/gameId：直接走 mock（保留开发预览）
    // 若同时带有 id，仍优先尝试真实 adapter，失败再 mock
    if (forceMock && !matchId && !gameId) {
      return {
        dataSource: 'mock',
        rows: this._loadMockStatisticsRows()
      };
    }

    if (matchId) {
      const match = teamMatchStore.getMatchById(matchId);
      if (match) {
        // G5–G8 Match Play：与 G1–G4 比杆统计分流
        const isMatchPlay = isMatchPlayBoardMode(resolveGameMode(match));
        let adapterRows = [];
        if (isMatchPlay) {
          adapterRows = this._buildMatchPlayStatisticsRows(match) || [];
        } else {
          const useEntity = statisticsAdapter.shouldUseEntityStatistics(match);
          adapterRows = useEntity
            ? (statisticsAdapter.buildEntityStatisticsRows(match) || [])
            : (statisticsAdapter.buildStatisticsRows(match) || []);
        }
        if (adapterRows.length > 0) {
          // G6–G8：用合成 Entity score 上下文，避免 filledHoles 读不到 scoresBySide
          const mapMatch =
            isMatchPlay &&
            typeof statisticsAdapter.buildMatchPlayScoreDataContext === 'function'
              ? statisticsAdapter.buildMatchPlayScoreDataContext(match) || match
              : match;
          const viewRows = this._mapAdapterRowsToView(mapMatch, adapterRows);
          return {
            dataSource: 'adapter',
            rows: this._applyCurrentSort(viewRows, 'total', 'asc')
          };
        }
      }
    }

    if (gameId) {
      const game = gameStore.getGame(gameId);
      if (game) {
        const adapterRows = statisticsAdapter.buildGameStatisticsRows(game) || [];
        if (adapterRows.length > 0) {
          const scoreCtx = statisticsAdapter.buildGameScoreDataContext(game);
          const viewRows = this._mapAdapterRowsToView(scoreCtx, adapterRows);
          return {
            dataSource: 'adapter',
            rows: this._applyCurrentSort(viewRows, 'total', 'asc')
          };
        }
      }
    }

    if (forceMock) {
      return {
        dataSource: 'mock',
        rows: this._loadMockStatisticsRows()
      };
    }

    return {
      dataSource: 'empty',
      rows: []
    };
  },

  /**
   * G5–G8 Match Play 统计行 → statisticsAdapter.buildMatchPlayStatisticsRows
   */
  _buildMatchPlayStatisticsRows(match) {
    if (
      statisticsAdapter &&
      typeof statisticsAdapter.buildMatchPlayStatisticsRows === 'function'
    ) {
      return statisticsAdapter.buildMatchPlayStatisticsRows(match) || [];
    }
    return [];
  },

  /**
   * 将 adapter 行映射为表格展示字段；
   * filledHoles === 0 → 全部统计列显示 '-'；filledHoles > 0 → 保持 adapter 原值（含 0）
   */
  _mapAdapterRowsToView(match, adapterRows) {
    const list = Array.isArray(adapterRows) ? adapterRows : [];
    return list.map((p, index) => {
      const filledHoles = this._countFilledHolesForStatsRow(match, p);
      const hasScore = filledHoles > 0;
      const dash = '-';
      const eagle = hasScore ? p.eagle : dash;
      const birdie = hasScore ? p.birdie : dash;
      const par = hasScore ? p.par : dash;
      const bogey = hasScore ? p.bogey : dash;
      const doublePlus = hasScore ? p.doublePlus : dash;
      const putts = hasScore ? p.putts : dash;
      const total = hasScore ? p.total : dash;
      const girPercent = hasScore ? p.girPercent : dash;
      const fairwayPercent = hasScore ? p.fairwayPercent : dash;
      const sand = hasScore ? p.sand : dash;
      const penalty = hasScore ? p.penalty : dash;
      const stat8421 = hasScore ? p.stat8421 : dash;
      const gender = p.gender === 'female' ? 'female' : (p.gender === 'male' ? 'male' : '');
      const entityId = p.entityId != null ? String(p.entityId).trim() : '';
      const isEntity = p.isEntity === true || !!entityId;
      const playerId = p.playerId != null ? String(p.playerId).trim() : '';
      // 组合头像：沿用 score pairMembers 的 members[].avatar，最多 4 人叠放
      const members = isEntity
        ? (Array.isArray(p.members) ? p.members : [])
            .filter((m) => m && (m.userId || m.avatar))
            .slice(0, 4)
            .map((m) => ({
              userId: m.userId != null ? String(m.userId) : '',
              name: m.name || '',
              avatar: m.avatar || ''
            }))
        : [];
      const memberCount = members.length;
      return {
        id: entityId || playerId || ('stats-' + index),
        isEntity: isEntity,
        entityId: entityId,
        playerId: playerId,
        scorePlayerId: p.scorePlayerId || playerId || '',
        groupId: p.groupId || '',
        avatar: p.avatar || mockAvatars.pickMockAvatar(p.name || entityId || playerId || index),
        members: members,
        showPairedAvatars: isEntity && memberCount > 0,
        avatarSlotClass: isEntity
          ? ('st-avatar-slot--n' + Math.max(1, Math.min(memberCount, 4)))
          : 'st-avatar-slot--single',
        name: p.name || (isEntity ? '组合' : '未知球员'),
        gender: gender,
        genderIcon: isEntity ? '' : (p.genderIcon || ''),
        genderClass: gender === 'female' ? 'gender-female' : (gender === 'male' ? 'gender-male' : ''),
        teeColor: p.teeColor || '#ffffff',
        teeMarkerClass: resolveTeeMarkerClass(p.teeColor),
        hasScore: hasScore,
        eagle: eagle,
        birdie: birdie,
        par: par,
        bogey: bogey,
        doublePlus: doublePlus,
        girPercent: girPercent,
        putts: putts,
        fairwayPercent: fairwayPercent,
        sand: sand,
        penalty: penalty,
        stat8421: stat8421,
        total: total,
        eag: eagle,
        bir: birdie,
        bog: bogey,
        dbl: doublePlus,
        gir: girPercent,
        fwy: fairwayPercent,
        pen: penalty,
        score8421: stat8421,
        eagMuted: isZeroLike(eagle),
        birMuted: isZeroLike(birdie),
        sandMuted: isZeroLike(sand)
      };
    });
  },

  /**
   * 按 sortField / sortOrder 排列 rows
   * - 百分比（gir/fwy："71%"）转数字比较
   * - '-' / 空 永远排最后
   * @param {Array} rows
   * @param {string} [fieldOverride] 可选，避免 setData 异步导致读到旧状态
   * @param {string} [orderOverride]
   */
  _applyCurrentSort(rows, fieldOverride, orderOverride) {
    const field = fieldOverride != null && fieldOverride !== ''
      ? String(fieldOverride)
      : (this.data.sortField || 'total');
    const order = orderOverride === 'desc' || orderOverride === 'asc'
      ? orderOverride
      : (this.data.sortOrder || 'asc');
    const list = Array.isArray(rows) ? rows.slice() : [];
    const valueOf = (row) => {
      if (!row) return null;
      if (field === 'total') return row.total;
      if (field === 'putts') return row.putts;
      if (field === 'eag' || field === 'eagle') return row.eagle;
      if (field === 'bir' || field === 'birdie') return row.birdie;
      if (field === 'par') return row.par;
      if (field === 'bog' || field === 'bogey') return row.bogey;
      if (field === 'dbl' || field === 'doublePlus') return row.doublePlus;
      if (field === 'gir') return row.girPercent != null ? row.girPercent : row.gir;
      if (field === 'fwy') return row.fairwayPercent != null ? row.fairwayPercent : row.fwy;
      if (field === 'sand') return row.sand;
      if (field === 'pen' || field === 'penalty') return row.penalty != null ? row.penalty : row.pen;
      if (field === 'score8421' || field === 'stat8421') {
        return row.stat8421 != null ? row.stat8421 : row.score8421;
      }
      return row[field];
    };
    list.sort((a, b) => {
      const ap = parseStatsSortValue(valueOf(a));
      const bp = parseStatsSortValue(valueOf(b));
      if (ap.missing && bp.missing) return 0;
      if (ap.missing) return 1;
      if (bp.missing) return -1;
      if (ap.num != null && bp.num != null) {
        if (ap.num === bp.num) return 0;
        return order === 'asc' ? ap.num - bp.num : bp.num - ap.num;
      }
      if (ap.str === bp.str) return 0;
      const cmp = ap.str < bp.str ? -1 : 1;
      return order === 'asc' ? cmp : -cmp;
    });
    return list;
  },

  _statsRowHasScoreData(scoreData, row) {
    const groupId = row && row.groupId != null ? String(row.groupId).trim() : '';
    const groupScore = groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
      ? scoreData[groupId]
      : null;
    if (!groupScore) return false;

    const entityId = row && row.entityId != null ? String(row.entityId).trim() : '';
    if (row && (row.isEntity === true || entityId)) {
      if (!entityId) return false;
      const list = Array.isArray(groupScore.teamScoresByEntity) ? groupScore.teamScoresByEntity : [];
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        if (!rec || typeof rec !== 'object') continue;
        const key =
          rec.teamId != null && String(rec.teamId).trim() !== ''
            ? String(rec.teamId).trim()
            : rec.entityId != null && String(rec.entityId).trim() !== ''
              ? String(rec.entityId).trim()
              : '';
        if (key === entityId) return Array.isArray(rec.scores);
      }
      return false;
    }

    const scorePlayerId = row && row.scorePlayerId != null ? String(row.scorePlayerId).trim() : '';
    const playerId = row && row.playerId != null ? String(row.playerId).trim() : '';
    const byPlayer = groupScore.scoresByPlayer && typeof groupScore.scoresByPlayer === 'object'
      ? groupScore.scoresByPlayer
      : null;
    if (!byPlayer) return false;
    const record = (scorePlayerId && byPlayer[scorePlayerId]) || (playerId && byPlayer[playerId]) || null;
    return !!(record && Array.isArray(record.scores));
  },

  _countFilledHolesForStatsRow(match, row) {
    const scoreData = match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
    if (!this._statsRowHasScoreData(scoreData, row)) return 0;
    const groupId = String(row.groupId || '').trim();
    const groupScore = scoreData[groupId];
    let scores = [];

    const entityId = row && row.entityId != null ? String(row.entityId).trim() : '';
    if (row && (row.isEntity === true || entityId)) {
      const list = Array.isArray(groupScore.teamScoresByEntity) ? groupScore.teamScoresByEntity : [];
      for (let i = 0; i < list.length; i++) {
        const rec = list[i];
        if (!rec || typeof rec !== 'object') continue;
        const key =
          rec.teamId != null && String(rec.teamId).trim() !== ''
            ? String(rec.teamId).trim()
            : rec.entityId != null && String(rec.entityId).trim() !== ''
              ? String(rec.entityId).trim()
              : '';
        if (key === entityId) {
          scores = Array.isArray(rec.scores) ? rec.scores : [];
          break;
        }
      }
    } else {
      const byPlayer = groupScore.scoresByPlayer;
      const scorePlayerId = String(row.scorePlayerId || '').trim();
      const playerId = String(row.playerId || '').trim();
      const record = (scorePlayerId && byPlayer[scorePlayerId]) || (playerId && byPlayer[playerId]) || null;
      scores = record && Array.isArray(record.scores) ? record.scores : [];
    }

    let filled = 0;
    scores.forEach((score) => {
      if (score === null || score === undefined || score === '') return;
      if (Number.isNaN(Number(score))) return;
      filled += 1;
    });
    return filled;
  },

  /**
   * 开发 mock 数据源：mockStatisticsPlayers 预制；仍走统一排序（默认 total asc）
   */
  _loadMockStatisticsRows() {
    return this._applyCurrentSort(mapMockPlayersToRows(mockStatisticsPlayers), 'total', 'asc');
  },

  onShow() {
    const themeClass = this._resolveThemeClass();
    if (themeClass !== this.data.themeClass) {
      this.setData({ themeClass: themeClass });
    }
    this._applyPageBackground();
    this._lockLandscape();
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
        backgroundColorBottom: dark ? '#000000' : '#f0f2f5'
      });
    }
  },

  onUnload() {
    this._restorePortrait();
  },

  onHide() {
    // 系统手势返回不走 onBack，须在隐藏时恢复竖屏
    this._restorePortrait();
  },

  _lockLandscape() {
    if (typeof wx.setPageOrientation === 'function') {
      wx.setPageOrientation({ orientation: 'landscape' });
    }
  },

  _restorePortrait(done) {
    const finish = typeof done === 'function' ? done : null;
    if (typeof wx.setPageOrientation !== 'function') {
      if (finish) finish();
      return;
    }
    // 等方向 API 完成后再离开页面，避免卸载竞态导致 portrait 未生效
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
  },

  /**
   * 表头排序：更新 sortField/sortOrder，并重排 rows
   * - 首次点击字段 → 该字段默认方向
   * - 再点同一字段 → asc <-> desc
   * - active-sort 仍由 sortField 驱动
   */
  onSortHeaderTap(e) {
    const field = e && e.currentTarget && e.currentTarget.dataset
      ? String(e.currentTarget.dataset.field || '').trim()
      : '';
    if (!field) return;

    let nextField = field;
    let nextOrder;
    if (field === this.data.sortField) {
      nextOrder = this.data.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      nextOrder = resolveDefaultSortOrder(field);
    }

    const sortedRows = this._applyCurrentSort(this.data.rows, nextField, nextOrder);
    this.setData({
      sortField: nextField,
      sortOrder: nextOrder,
      rows: sortedRows
    });
  }
});
