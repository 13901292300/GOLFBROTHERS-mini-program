/**
 * 球友圈只读成绩卡（player 分包）
 * hideEnter=false：仅右侧「查看比赛」图标 catchtap → opentap；其余区域只读且不冒泡。
 * hideEnter=true：隐藏图标；onEnterGame 直接返回；不触发 opentap。
 */
Component({
  properties: {
    scorecard: {
      type: Object,
      value: null
    },
    themeClass: {
      type: String,
      value: 'bright-mode'
    },
    scoreDisplayMode: {
      type: String,
      value: 'gross'
    },
    /** true：详情等内嵌只读，隐藏进入图标且不发 opentap */
    hideEnter: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    onEnterGame() {
      if (this.data.hideEnter) return;
      if (this._enterLock) return;
      const sc = this.data.scorecard;
      if (!sc || sc.unavailable || !sc.ok) return;
      this._enterLock = true;
      const self = this;
      setTimeout(function () {
        self._enterLock = false;
      }, 700);
      const authorUserId = sc.authorUserId || sc.targetUserId || '';
      this.triggerEvent('opentap', {
        viewUrl: sc.viewUrl || '',
        publicScorecardId: sc.publicScorecardId || '',
        ok: !!sc.ok,
        authorUserId: authorUserId,
        targetUserId: authorUserId,
        sourceType: sc.sourceType || '',
        gameId: sc.gameId || '',
        matchId: sc.matchId || '',
        groupId: sc.groupId || '',
        slotId: sc.slotId || '',
        matchName: sc.matchName || '',
        gameMode: sc.gameMode || '',
        modeLabel: sc.modeLabel || '',
        courseName: sc.courseName || ''
      });
    },

    /** 吞掉成绩区 tap，避免冒泡到动态卡片进入详情 */
    noop() {}
  }
});
