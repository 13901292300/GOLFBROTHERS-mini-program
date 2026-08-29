/**
 * Series 轮次选择器 + 说明行 dock（总榜 / 赛程共用）
 * selectorMode: chip | dropdown（系列赛总榜 / 赛程默认 dropdown）
 * 不写页面 scrollTop / filler / sticky。
 */

var overflowArrows = require('./overflowArrows.js');

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    showTot: { type: Boolean, value: false },
    totalSelector: { type: Object, value: {} },
    rounds: { type: Array, value: [] },
    roundInfoText: { type: String, value: '' },
    scrollLeft: { type: Number, value: 0 },
    intoView: { type: String, value: '' },
    mode: { type: String, value: 'inflow' },
    sticky: { type: Boolean, value: false },
    top: { type: Number, value: 0 },
    themeClass: { type: String, value: '' },
    selectorMode: { type: String, value: 'chip' }
  },

  data: {
    showLeftArrow: false,
    showRightArrow: false,
    dropdownOpen: false,
    selectedDisplayText: '选择轮次'
  },

  observers: {
    'rounds, scrollLeft, showTot, selectorMode': function () {
      this._updateSelectedDisplay(this.data.rounds);
      if (this.data.selectorMode === 'dropdown') {
        this._setOverflow({ showLeft: false, showRight: false });
        return;
      }
      this._measureOverflow();
    }
  },

  lifetimes: {
    attached: function () {
      this._updateSelectedDisplay(this.data.rounds);
    },
    ready: function () {
      if (this.data.selectorMode !== 'dropdown') {
        this._measureOverflow();
      }
    }
  },

  methods: {
    _updateSelectedDisplay: function (rounds) {
      var list = Array.isArray(rounds) ? rounds : [];
      if (!list.length) {
        if (this.data.selectedDisplayText !== '暂无轮次') {
          this.setData({ selectedDisplayText: '暂无轮次' });
        }
        return;
      }
      var selected = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].isSelected) {
          selected = list[i];
          break;
        }
      }
      var src = selected || list[0] || {};
      var text = String(src.displayText || src.label || '选择轮次').trim() || '选择轮次';
      if (text === this.data.selectedDisplayText) return;
      this.setData({ selectedDisplayText: text });
    },

    onDropdownToggle: function () {
      var list = Array.isArray(this.data.rounds) ? this.data.rounds : [];
      if (!list.length) return;
      this.setData({ dropdownOpen: !this.data.dropdownOpen });
    },

    onDropdownClose: function () {
      if (!this.data.dropdownOpen) return;
      this.setData({ dropdownOpen: false });
    },

    onItemTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var key = ds.key != null ? String(ds.key).trim() : '';
      if (!key) return;
      this.setData({ dropdownOpen: false });
      this.triggerEvent('roundtap', { key: key });
    },

    onMenuTap: function () {},

    onRoundTap: function (e) {
      var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      var key = ds.key != null ? String(ds.key).trim() : '';
      if (!key) return;
      this.triggerEvent('roundtap', { key: key });
    },

    onHScroll: function (e) {
      var detail = (e && e.detail) || {};
      this._applyOverflowFromScroll(detail);
      this.triggerEvent('hscroll', detail);
    },

    _applyOverflowFromScroll: function (detail) {
      var left = Number(detail && detail.scrollLeft);
      if (!Number.isFinite(left)) left = Number(this.data.scrollLeft) || 0;
      this._lastScrollLeft = left;
      var viewW = this._viewportWidth || 0;
      var contentW =
        Number(detail && detail.scrollWidth) || this._contentWidth || 0;
      if (viewW > 0 && contentW > 0) {
        this._setOverflow(overflowArrows.resolveOverflowArrows(left, viewW, contentW));
        return;
      }
      this._measureOverflow();
    },

    _setOverflow: function (next) {
      var showLeft = !!(next && next.showLeft);
      var showRight = !!(next && next.showRight);
      if (
        showLeft === this.data.showLeftArrow &&
        showRight === this.data.showRightArrow
      ) {
        return;
      }
      this.setData({
        showLeftArrow: showLeft,
        showRightArrow: showRight
      });
    },

    _measureOverflow: function () {
      var self = this;
      if (this.data.selectorMode === 'dropdown') return;
      if (typeof this.createSelectorQuery !== 'function') return;
      var token = (this._overflowMeasureToken || 0) + 1;
      this._overflowMeasureToken = token;
      this.createSelectorQuery()
        .select('.series-standings-round-scroll')
        .boundingClientRect()
        .select('.series-standings-round-row')
        .boundingClientRect()
        .exec(function (res) {
          if (token !== self._overflowMeasureToken) return;
          var view = res && res[0];
          var row = res && res[1];
          var viewW = view && view.width ? Number(view.width) : 0;
          var contentW = row && row.width ? Number(row.width) : 0;
          if (viewW > 0) self._viewportWidth = viewW;
          if (contentW > 0) self._contentWidth = contentW;
          var left =
            self._lastScrollLeft != null
              ? self._lastScrollLeft
              : Number(self.data.scrollLeft) || 0;
          self._setOverflow(
            overflowArrows.resolveOverflowArrows(left, viewW, contentW)
          );
        });
    }
  }
});
