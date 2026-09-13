const halfCourseEdit = require('../../utils/halfCourseEdit.js');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    gameId: {
      type: String,
      value: ''
    },
    matchId: {
      type: String,
      value: ''
    },
    mode: {
      type: String,
      value: ''
    },
    source: {
      type: String,
      value: ''
    },
    /** 与记分页同源：dark-mode | bright-mode（组件 isolated，须自行挂载） */
    themeClass: {
      type: String,
      value: ''
    },
    /** 可选副标题；空则展示 COURSE（Series 传入 R{n} · 轮名） */
    roundSubtitle: {
      type: String,
      value: ''
    }
  },

  data: {
    halfCourse: { id: '', name: '', location: '' },
    halves: [],
    front9: null,
    back9: null
  },

  observers: {
    visible(v) {
      if (v) this._initSheet();
    }
  },

  methods: {
    _ctx() {
      return halfCourseEdit.buildContext({
        gameId: this.properties.gameId,
        matchId: this.properties.matchId,
        mode: this.properties.mode,
        source: this.properties.source
      });
    },

    _initSheet() {
      const prep = halfCourseEdit.prepareSheet(this._ctx());
      if (!prep.ok) {
        wx.showToast({ title: prep.message || '未找到球场数据', icon: 'none' });
        this.triggerEvent('close');
        return;
      }
      this.setData(prep.data);
    },

    noop() {},

    onClose() {
      this.triggerEvent('close');
    },

    selectHalf(e) {
      const side = e.currentTarget.dataset.side;
      const key = e.currentTarget.dataset.key;
      if (side === 'front') {
        this.setData({ front9: this.data.front9 === key ? null : key });
      } else {
        this.setData({ back9: this.data.back9 === key ? null : key });
      }
    },

    toggleHalfRow(e) {
      const key = e.currentTarget.dataset.key;
      if (this.data.front9 === key) {
        this.setData({ front9: null });
      } else if (this.data.back9 === key) {
        this.setData({ back9: null });
      } else if (!this.data.front9) {
        this.setData({ front9: key });
      } else if (!this.data.back9) {
        this.setData({ back9: key });
      } else {
        wx.showToast({ title: '前9/后9 已选满，先取消其一', icon: 'none' });
      }
    },

    confirmEditHalf() {
      const front9 = this.data.front9;
      const back9 = this.data.back9;
      if (!front9 && !back9) {
        wx.showToast({ title: '请至少选择一个半场', icon: 'none' });
        return;
      }
      const result = halfCourseEdit.apply(this._ctx(), front9, back9);
      if (result && result.ok === false) {
        const details = Array.isArray(result.details) ? result.details.filter(Boolean) : [];
        const message = result.message || '比赛已经结束。';
        if (details.length) {
          wx.showModal({
            title: '无法更换半场',
            content: message + '\n' + details.slice(0, 8).join('\n'),
            showCancel: false
          });
        } else {
          wx.showToast({
            title: message,
            icon: 'none'
          });
        }
        return;
      }
      this.triggerEvent('confirm', result);
      this.triggerEvent('close');
      wx.showToast({ title: '半场已更新', icon: 'success' });
    }
  }
});
