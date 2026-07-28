/**
 * schedule-day-sheet — 首页日程「某日事件列表」底部 Sheet（V1）
 *
 * 入参：date / events / visible
 * 出参：close | add | edit | viewMatch | editNote
 * 不写 scheduleStore。
 */

const WEEKDAYS_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/**
 * YYYY-MM-DD → 「2026年7月30日 星期四」
 * @param {string} dateKey
 * @returns {string}
 */
function formatDateTitle(dateKey) {
  const raw = String(dateKey || '').trim();
  const parts = raw.split('-');
  if (parts.length !== 3) return raw || '';
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return raw;
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return raw;
  return y + '年' + m + '月' + d + '日 ' + WEEKDAYS_ZH[dt.getDay()];
}

/**
 * 归一化来源并生成展示字段（不改原始 store 结构）
 * @param {object} item
 * @returns {object}
 */
function decorateEvent(item) {
  const raw = item && typeof item === 'object' ? item : {};
  const sourceType = String(raw.sourceType || 'self').trim() || 'self';
  let sourceLabel = '我的日程';
  let actionLabel = '编辑';
  let actionMode = 'edit';
  if (sourceType === 'team_match') {
    sourceLabel = '球队赛事';
    actionLabel = '查看赛事';
    actionMode = 'viewMatch';
  } else if (sourceType === 'friend_reminder') {
    sourceLabel = '好友提醒';
    actionLabel = '编辑';
    actionMode = 'edit';
  }
  return Object.assign({}, raw, {
    sourceType: sourceType,
    sourceLabel: sourceLabel,
    actionLabel: actionLabel,
    actionMode: actionMode,
    sourceId: raw.sourceId != null ? String(raw.sourceId) : '',
    note: raw.note != null ? String(raw.note) : ''
  });
}

Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    date: { type: String, value: '' },
    events: { type: Array, value: [] },
    visible: { type: Boolean, value: false },
    /** 与首页同源：dark-theme | bright-mode（组件 isolated，须自行挂载） */
    themeClass: { type: String, value: 'bright-mode' }
  },

  data: {
    dateTitle: '',
    displayEvents: []
  },

  observers: {
    date: function (date) {
      this.setData({ dateTitle: formatDateTitle(date) });
    },
    events: function (list) {
      const arr = Array.isArray(list) ? list : [];
      this.setData({
        displayEvents: arr.map(decorateEvent)
      });
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        dateTitle: formatDateTitle(this.properties.date),
        displayEvents: (Array.isArray(this.properties.events)
          ? this.properties.events
          : []
        ).map(decorateEvent)
      });
    }
  },

  methods: {
    formatDateTitle: formatDateTitle,

    stopPropagation() {},

    onOverlayTap() {
      this.triggerEvent('close', {});
    },

    onCloseTap() {
      this.triggerEvent('close', {});
    },

    onAddTap() {
      const date = String(this.properties.date || '');
      this.triggerEvent('add', { date: date });
    },

    onEventTap(e) {
      const ds =
        e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
      const mode = String(ds.mode || 'edit');
      const id = ds.id != null ? String(ds.id) : '';
      const matchId = ds.matchid != null ? String(ds.matchid) : '';

      if (mode === 'viewMatch') {
        if (!matchId) return;
        this.triggerEvent('viewMatch', { matchId: matchId });
        return;
      }
      if (!id) return;
      this.triggerEvent('edit', { id: id });
    },

    /** 球队赛：赛事信息区 → 详情 */
    onMatchAreaTap(e) {
      const ds =
        e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
      const matchId = ds.matchid != null ? String(ds.matchid) : '';
      if (!matchId) return;
      this.triggerEvent('viewMatch', { matchId: matchId });
    },

    /** 球队赛：备注区 → 编辑备注 */
    onNoteAreaTap(e) {
      const ds =
        e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
      const id = ds.id != null ? String(ds.id) : '';
      if (!id) return;
      this.triggerEvent('editNote', { id: id });
    }
  }
});

module.exports = {
  formatDateTitle: formatDateTitle,
  decorateEvent: decorateEvent
};
