/**
 * 球友圈只读成绩卡（player 分包）
 * 比杆：赛制｜球场｜进入GAME + 领先榜逐洞图模式
 * 比洞：红蓝头像组 + 胜洞趋势 + 1～18 洞状态
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
    }
  },

  methods: {
    onEnterGame() {
      const sc = this.data.scorecard;
      if (!sc) return;
      this.triggerEvent('opentap', {
        viewUrl: sc.viewUrl || '',
        publicScorecardId: sc.publicScorecardId || '',
        ok: !!sc.ok
      });
    }
  }
});
