/**
 * 领先榜球员身份单元格：昵称 + 性别符号 + 可选轮次/pending 标签。
 * 不负责 POS / 成绩 / 点击。
 */
Component({
  options: {
    virtualHost: true,
    styleIsolation: 'apply-shared'
  },
  properties: {
    name: { type: String, value: '' },
    genderIcon: { type: String, value: '' },
    genderClass: { type: String, value: '' },
    roundLabel: { type: String, value: '' },
    showRoundTag: { type: Boolean, value: false },
    pendingLabel: { type: String, value: '' },
    subLabel: { type: String, value: '' }
  }
});
