/**
 * schedule-editor-sheet — 首页日程「创建 / 编辑」底部 Sheet（V1）
 *
 * 入参：visible / date / schedule
 * 出参：close | save | delete | openMemberPicker
 * 不写 scheduleStore（由页面保存）。
 */

function normalizeMembers(list) {
  if (!Array.isArray(list)) return [];
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (!raw || typeof raw !== 'object') continue;
    const userId = String(
      raw.userId != null ? raw.userId : raw.id != null ? raw.id : ''
    ).trim();
    if (!userId || seen[userId]) continue;
    seen[userId] = true;
    out.push({
      userId: userId,
      name: String(raw.name != null ? raw.name : ''),
      avatar: String(raw.avatar != null ? raw.avatar : '')
    });
  }
  return out;
}

Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    visible: { type: Boolean, value: false },
    date: { type: String, value: '' },
    schedule: { type: Object, value: null }
  },

  data: {
    content: '',
    selectedMembers: [],
    sheetTitle: '新增日程',
    saveBtnLabel: '保存',
    isEdit: false
  },

  observers: {
    'visible, schedule, date': function (visible) {
      if (!visible) return;
      this._hydrateFromProps();
    }
  },

  methods: {
    stopPropagation() {},

    _hydrateFromProps() {
      const schedule = this.properties.schedule;
      const hasSchedule = !!(schedule && typeof schedule === 'object' && schedule.id);
      if (hasSchedule) {
        this.setData({
          isEdit: true,
          sheetTitle: '编辑日程',
          saveBtnLabel: '保存修改',
          content: schedule.content != null ? String(schedule.content) : '',
          selectedMembers: normalizeMembers(schedule.members)
        });
      } else {
        this.setData({
          isEdit: false,
          sheetTitle: '新增日程',
          saveBtnLabel: '保存',
          content: '',
          selectedMembers: []
        });
      }
    },

    /** 供页面好友选择器回写 */
    setSelectedMembers(members) {
      this.setData({ selectedMembers: normalizeMembers(members) });
    },

    onContentInput(e) {
      const value = e && e.detail ? e.detail.value : '';
      this.setData({ content: value != null ? String(value) : '' });
    },

    onCloseTap() {
      this.triggerEvent('close', {});
    },

    onOverlayTap() {
      this.triggerEvent('close', {});
    },

    onOpenMemberPicker() {
      this.triggerEvent('openMemberPicker', {
        selectedIds: (this.data.selectedMembers || []).map(function (m) {
          return m.userId;
        })
      });
    },

    onRemoveMember(e) {
      const userId =
        e && e.currentTarget && e.currentTarget.dataset
          ? String(e.currentTarget.dataset.userid || '')
          : '';
      if (!userId) return;
      const next = (this.data.selectedMembers || []).filter(function (m) {
        return m.userId !== userId;
      });
      this.setData({ selectedMembers: next });
    },

    onDeleteTap() {
      const schedule = this.properties.schedule;
      const id = schedule && schedule.id != null ? String(schedule.id) : '';
      if (!id) return;
      this.triggerEvent('delete', { id: id });
    },

    onSaveTap() {
      const content = String(this.data.content || '').trim();
      if (!content) {
        wx.showToast({ title: '请输入日程内容', icon: 'none' });
        return;
      }
      this.triggerEvent('save', {
        date: String(this.properties.date || ''),
        content: content,
        remindees: normalizeMembers(this.data.selectedMembers),
        scheduleId:
          this.properties.schedule && this.properties.schedule.id
            ? String(this.properties.schedule.id)
            : ''
      });
    }
  }
});
