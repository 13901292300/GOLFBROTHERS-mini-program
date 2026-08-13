/**
 * 球队赛分组编辑视图内核（只读展示 + 交互事件上抛）
 * - 供 group-editor 页与后续 Series sheet 共用
 * - 不写 storage；不打开 group-pick；不保存
 */

Component({
  options: {
    styleIsolation: 'apply-shared',
    multipleSlots: false
  },

  properties: {
    themeClass: { type: String, value: 'bright-mode' },
    /** create | edit | live — 仅视觉态标记，不改变业务 */
    mode: { type: String, value: 'create' },
    draftCards: { type: Array, value: [] },
    showCompositionMode: { type: Boolean, value: false },
    strokeCompositionMode: { type: String, value: '2+2' },
    showPairingSection: { type: Boolean, value: false },
    showPairingComposeTools: { type: Boolean, value: false },
    showAddGroup: { type: Boolean, value: true },
    /** sheet：收紧内边距，供 Series bottom sheet；page：对齐独立编辑页 */
    layout: { type: String, value: 'page' },
    /**
     * true：席位可点（Series 页内候选 sheet）；false：整卡点击（group-editor→group-pick）
     * 默认 false，不改变普通赛事行为
     */
    seatInteractive: { type: Boolean, value: false }
  },

  methods: {
    stopPropagation: function () {},

    onStrokeCompositionModeTap: function (e) {
      var mode =
        e && e.currentTarget && e.currentTarget.dataset
          ? String(e.currentTarget.dataset.mode || '')
          : '';
      this.triggerEvent('compositionmode', { mode: mode });
    },

    onGroupCardTap: function (e) {
      // 席位交互模式下由 seattap 承接，避免整卡误触
      if (this.properties.seatInteractive) return;
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('groupcardtap', {
        groupId: ds.groupId != null ? String(ds.groupId) : '',
        groupName: ds.groupName != null ? String(ds.groupName) : ''
      });
    },

    onSeatTap: function (e) {
      if (!this.properties.seatInteractive) return;
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var position = Number(ds.position);
      this.triggerEvent('seattap', {
        groupId: ds.groupId != null ? String(ds.groupId) : '',
        position: Number.isFinite(position) ? position : 0,
        userId: ds.userId != null ? String(ds.userId) : ''
      });
    },

    onDeleteGroupTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('deletegroup', {
        groupId: ds.groupId != null ? String(ds.groupId) : '',
        groupName: ds.groupName != null ? String(ds.groupName) : ''
      });
    },

    onAddGroup: function () {
      this.triggerEvent('addgroup', {});
    },

    onEditPairingTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('editpairing', {
        groupId: ds.groupId != null ? String(ds.groupId) : '',
        pairingId: ds.pairingId != null ? String(ds.pairingId) : ''
      });
    },

    onDeletePairingTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('deletepairing', {
        groupId: ds.groupId != null ? String(ds.groupId) : '',
        pairingId: ds.pairingId != null ? String(ds.pairingId) : ''
      });
    },

    onAutoPairTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('autopair', {
        groupId: ds.groupId != null ? String(ds.groupId) : ''
      });
    },

    onAddPairingTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('addpairing', {
        groupId: ds.groupId != null ? String(ds.groupId) : ''
      });
    }
  }
});
