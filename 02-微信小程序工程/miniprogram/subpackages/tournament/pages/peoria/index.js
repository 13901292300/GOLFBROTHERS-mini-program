/**
 * 新新贝利亚净杆配置 + 计算页（Peoria-0.2 / 0.3-A 锁定）
 * 18 洞标签按比赛半场布局；selectedHoles 为开球顺序 1–18。
 * 已生成 peoriaResult 后冻结，禁止重算覆盖。
 */
const { createHeaderStyle } = require('../../../../utils/headerEngine.js');
const peoriaStore = require('../../../../utils/peoriaStore.js');
const peoriaCalculator = require('../../../../utils/peoriaCalculator.js');
const teamMatchStore = require('../../../../utils/teamMatchStore.js');
const holeLayout = require('../../../../utils/holeLayout.js');
const halfCourse = require('../../../../utils/halfCourse.js');

const DRAW_INTERVAL_MS = 120;
const SPECIAL_COL = { 9: true, 19: true, 20: true };

function resolveMatchLayout(match) {
  const m = match || {};
  const parsed =
    !m.front9Course && !m.back9Course
      ? halfCourse.parseCourseHalfText(m.courseHalfText || m.courseHalf || m.halfText)
      : {};
  return holeLayout.resolveLayoutFromContext({
    courseId: m.courseId || '',
    courseName: m.courseName || '',
    front9Course: m.front9Course || parsed.front9Course || null,
    back9Course: m.back9Course || parsed.back9Course || null
  });
}

function resolvePlayHoleLabels(match) {
  const layout = resolveMatchLayout(match);
  const cols = (layout && layout.columnLabels) || [];
  const labels = [];
  for (let i = 0; i < cols.length; i++) {
    if (SPECIAL_COL[i]) continue;
    labels.push(cols[i]);
  }
  while (labels.length < peoriaStore.HOLE_COUNT) {
    labels.push(String(labels.length + 1));
  }
  return labels.slice(0, peoriaStore.HOLE_COUNT);
}

function formatSelectedText(holes, labels) {
  const lab = labels || [];
  return (holes || [])
    .map((h) => {
      const idx = Number(h) - 1;
      return lab[idx] != null ? lab[idx] : String(h);
    })
    .join('、');
}

function buildHoleOptions(selectedHoles, labels) {
  const selected = {};
  (selectedHoles || []).forEach((h) => {
    selected[h] = true;
  });
  const lab = labels || [];
  const options = [];
  for (let i = 1; i <= peoriaStore.HOLE_COUNT; i++) {
    options.push({
      hole: i,
      label: lab[i - 1] != null ? lab[i - 1] : String(i),
      selected: !!selected[i]
    });
  }
  return options;
}

function formatCreatedAt(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (v) => (v < 10 ? '0' + v : String(v));
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

function resolveAnyPlayerId(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const id = raw.userId || raw.playerId || raw.id || raw.uid || raw.openid;
  return id != null ? String(id).trim() : '';
}

function resolveSlotScorePlayerId(slotPlayer, currentPlayerId) {
  const p = slotPlayer || {};
  const scorePlayerId = p.scorePlayerId || p.slotScorePlayerId || p.scoreOwnerId;
  const resolved = scorePlayerId != null ? String(scorePlayerId).trim() : '';
  if (resolved) return resolved;
  return currentPlayerId != null ? String(currentPlayerId).trim() : '';
}

/**
 * 仅从 match.groups + match.scoreData 组装计算器输入（不读 score 临时态 / gameStore / groupsStore）
 */
function buildPlayersFromMatchScoreData(match) {
  const scoreData =
    match && match.scoreData && typeof match.scoreData === 'object' && !Array.isArray(match.scoreData)
      ? match.scoreData
      : {};
  const groups = Array.isArray(match && match.groups) ? match.groups : [];
  const players = [];
  const seen = {};

  groups.forEach((group) => {
    const groupId = group && group.groupId != null ? String(group.groupId).trim() : '';
    const groupScore =
      groupId && scoreData[groupId] && typeof scoreData[groupId] === 'object'
        ? scoreData[groupId]
        : null;
    const scoresByPlayer =
      groupScore && groupScore.scoresByPlayer && typeof groupScore.scoresByPlayer === 'object'
        ? groupScore.scoresByPlayer
        : {};
    const slots = Array.isArray(group && group.players) ? group.players : [];

    slots.forEach((slot) => {
      const playerId = resolveAnyPlayerId(slot);
      if (!playerId) return;
      const scoreOwnerId = resolveSlotScorePlayerId(slot, playerId);
      const dedupeKey = scoreOwnerId || playerId;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;

      let record = null;
      if (scoreOwnerId && scoresByPlayer[scoreOwnerId]) record = scoresByPlayer[scoreOwnerId];
      else if (scoresByPlayer[playerId]) record = scoresByPlayer[playerId];

      const scores = record && Array.isArray(record.scores) ? record.scores.slice() : [];
      players.push({
        playerId: playerId,
        scores: scores
      });
    });
  });

  return players;
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    matchId: '',
    mode: 'random',
    selectedHoles: [],
    selectedText: '',
    holeOptions: [],
    drawing: false,
    canConfirm: false,
    locked: false,
    createdAtText: ''
  },

  onLoad(options) {
    const opt = options || {};
    const matchId = opt.matchId ? String(opt.matchId) : '';
    this._drawTimer = null;
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());

    const match = matchId ? teamMatchStore.getMatchById(matchId) : null;
    this._holeLabels = resolvePlayHoleLabels(match);

    // 已生成：只读冻结态，禁止重算
    if (match && match.peoriaResult && match.peoriaResult.status === 'generated') {
      const lockedHoles = peoriaStore.normalizeHoles(
        match.peoriaResult.selectedHoles ||
          (match.peoriaConfig && match.peoriaConfig.selectedHoles) ||
          []
      );
      const labels = this._holeLabels || [];
      this.setData({
        matchId: matchId,
        locked: true,
        mode: (match.peoriaConfig && match.peoriaConfig.mode === 'manual') ? 'manual' : 'random',
        selectedHoles: lockedHoles,
        selectedText: formatSelectedText(lockedHoles, labels),
        holeOptions: buildHoleOptions(lockedHoles, labels),
        drawing: false,
        canConfirm: false,
        createdAtText: formatCreatedAt(match.peoriaResult.createdAt)
      });
      return;
    }

    const existing = peoriaStore.getPeoriaConfig(matchId);
    let mode = 'random';
    let selectedHoles = [];
    if (existing && Array.isArray(existing.selectedHoles) && existing.selectedHoles.length) {
      mode = existing.mode === 'manual' ? 'manual' : 'random';
      selectedHoles = peoriaStore.normalizeHoles(existing.selectedHoles);
    }

    this.setData({ matchId: matchId, locked: false, createdAtText: '' });
    this._applySelection(mode, selectedHoles, false);
  },

  onUnload() {
    this._stopDrawTimer();
  },

  initHeaderNav() {
    const styles = createHeaderStyle();
    this.setData({
      headerRootStyle: styles.headerRootStyle,
      headerBarStyle: styles.headerBarStyle
    });
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  onBack() {
    this._stopDrawTimer();
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/home/index' }) });
  },

  _stopDrawTimer() {
    if (this._drawTimer) {
      clearInterval(this._drawTimer);
      this._drawTimer = null;
    }
  },

  _applySelection(mode, selectedHoles, drawing) {
    if (this.data.locked) return;
    const holes = peoriaStore.normalizeHoles(selectedHoles);
    const isDrawing = !!drawing;
    const m = mode === 'manual' ? 'manual' : 'random';
    const labels = this._holeLabels || [];
    this.setData({
      mode: m,
      selectedHoles: holes,
      selectedText: formatSelectedText(holes, labels),
      holeOptions: buildHoleOptions(holes, labels),
      drawing: isDrawing,
      canConfirm: !isDrawing && holes.length === peoriaStore.PICK_COUNT
    });
  },

  onSelectMode(e) {
    if (this.data.locked) return;
    const mode = e.currentTarget.dataset.mode;
    if (mode !== 'random' && mode !== 'manual') return;
    this._stopDrawTimer();
    this._applySelection(mode, [], false);
  },

  onToggleDraw() {
    if (this.data.locked) return;
    if (this.data.mode !== 'random') return;
    if (this.data.drawing) {
      this._stopDrawTimer();
      this._applySelection('random', this.data.selectedHoles, false);
      return;
    }
    this._stopDrawTimer();
    const tick = () => {
      const holes = peoriaStore.pickRandomHoles(peoriaStore.PICK_COUNT);
      this._applySelection('random', holes, true);
    };
    tick();
    this._drawTimer = setInterval(tick, DRAW_INTERVAL_MS);
  },

  onToggleHole(e) {
    if (this.data.locked) return;
    if (this.data.mode !== 'manual' || this.data.drawing) return;
    const hole = Number(e.currentTarget.dataset.hole);
    if (!Number.isFinite(hole)) return;
    let holes = (this.data.selectedHoles || []).slice();
    const idx = holes.indexOf(hole);
    if (idx >= 0) {
      holes.splice(idx, 1);
    } else {
      if (holes.length >= peoriaStore.PICK_COUNT) {
        wx.showToast({ title: '最多选择 6 洞', icon: 'none' });
        return;
      }
      holes.push(hole);
    }
    this._applySelection('manual', holes, false);
  },

  onViewLeaderboard() {
    const pages = getCurrentPages();
    const prev = pages.length >= 2 ? pages[pages.length - 2] : null;
    if (prev && typeof prev.openNetLeaderboardFromPeoria === 'function') {
      prev.openNetLeaderboardFromPeoria();
    }
    wx.navigateBack({
      fail: () => {
        const matchId = this.data.matchId || '';
        wx.redirectTo({
          url:
            '/subpackages/tournament/pages/detail/index' +
            (matchId ? '?matchId=' + encodeURIComponent(matchId) : '')
        });
      }
    });
  },

  onConfirm() {
    if (this.data.locked) {
      wx.showToast({
        title: '净杆已生成，请点击“领先榜”按钮查看。',
        icon: 'none'
      });
      return;
    }
    if (this.data.drawing) {
      wx.showToast({ title: '请先停止抽取', icon: 'none' });
      return;
    }
    if (!this.data.canConfirm) {
      wx.showToast({ title: '请先选择 6 个洞', icon: 'none' });
      return;
    }
    const matchId = this.data.matchId;
    if (!matchId) {
      wx.showToast({ title: '缺少比赛信息', icon: 'none' });
      return;
    }

    // 二次校验：禁止覆盖已生成结果
    const existingMatch = teamMatchStore.getMatchById(matchId);
    if (
      existingMatch &&
      existingMatch.peoriaResult &&
      existingMatch.peoriaResult.status === 'generated'
    ) {
      wx.showToast({
        title: '净杆已生成，请点击“领先榜”按钮查看。',
        icon: 'none'
      });
      return;
    }

    // 1) 先落盘 peoriaConfig（含当前 6 洞）
    const configResult = peoriaStore.savePeoriaConfig(matchId, {
      mode: this.data.mode,
      selectedHoles: this.data.selectedHoles
    });
    if (!configResult.ok) {
      wx.showToast({ title: configResult.message || '配置保存失败', icon: 'none' });
      return;
    }

    // 2) 读取正式 match（scoreData + peoriaConfig）
    const match = teamMatchStore.getMatchById(matchId);
    if (!match) {
      wx.showToast({ title: '未找到比赛', icon: 'none' });
      return;
    }
    const selectedHoles = peoriaStore.normalizeHoles(
      match.peoriaConfig && match.peoriaConfig.selectedHoles
    );
    if (selectedHoles.length !== peoriaStore.PICK_COUNT) {
      wx.showToast({ title: '请先选择 6 个洞', icon: 'none' });
      return;
    }

    // 3) 计算
    const layout = resolveMatchLayout(match);
    const players = buildPlayersFromMatchScoreData(match);
    const results = peoriaCalculator.calculatePeoriaResults({
      players: players,
      selectedHoles: selectedHoles,
      holeLayout: layout
    });

    if (!players.length) {
      wx.showToast({ title: '暂无参赛球员', icon: 'none' });
      return;
    }
    if (!results.length) {
      wx.showToast({ title: '暂无完整 18 洞成绩', icon: 'none' });
      return;
    }

    // 4) 保存 peoriaResult（store 内也会拒绝覆盖）
    const saveResult = peoriaStore.savePeoriaResult(matchId, {
      selectedHoles: selectedHoles,
      results: results
    });
    if (!saveResult.ok) {
      wx.showToast({ title: saveResult.message || '保存失败', icon: 'none' });
      return;
    }

    wx.showToast({ title: '净杆已生成', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ fail: () => {} });
    }, 500);
  }
});
