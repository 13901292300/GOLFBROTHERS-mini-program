/**
 * avatar-mosaic —— 全局唯一「微信群聊头像合成」组件
 *
 * 入参：
 *  - avatars: 头像 URL 数组（取值顺序由调用方保证：创建者 → 已确认 → 最近加入）
 *  - size:    合成区域边长(px)，默认 64
 *
 * 合成规则（按人数动态选择网格维度 d，方形拼图块、等比裁切、固定 1px 间距、末行居中）：
 *  1 人        → 单头像居中
 *  2-4 人      → d=2（2:左右 / 3:上2下1 / 4:2x2）
 *  5-9 人      → d=3（3x3）
 *  10-16 人    → d=4（4x4）
 *  16 人以上   → d=4，前 15 个头像 + 右下角「+N」(N = 总人数 - 15)
 *
 * 布局原则（容器驱动）：容器尺寸恒为 size×size，永不随头像数量变化；
 * 每个拼图块的边长由「固定容器尺寸」推导（cell = (size - gap*(d-1)) / d），
 * 而非由内容撑开容器。超出容量的头像被裁切/折叠为「+N」。
 */
const GAP = 1;

Component({
  options: {
    // 完全隔离：拼图系统不继承页面/全局 avatar 样式，避免圆形/记分卡头像样式污染
    styleIsolation: 'isolated'
  },
  properties: {
    avatars: { type: Array, value: [] },
    size: { type: Number, value: 64 }
  },
  data: {
    rows: [],
    cellStyle: '',
    plusStyle: ''
  },
  observers: {
    'avatars, size': function () {
      this._compute();
    }
  },
  lifetimes: {
    attached() {
      this._compute();
    }
  },
  methods: {
    _compute() {
      const list = (this.data.avatars || []).filter(Boolean);
      const n = list.length;
      const size = this.data.size || 64;

      // 网格维度
      const d = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
      const capacity = d * d;

      // 展示单元：超出容量 → 末格显示 +N（仅 >16 时发生，右下角）
      let cells;
      if (n > capacity) {
        cells = list.slice(0, capacity - 1).map((a) => ({ avatar: a }));
        cells.push({ plus: '+' + (n - (capacity - 1)) });
      } else {
        cells = list.slice(0, capacity).map((a) => ({ avatar: a }));
      }

      // 单元尺寸（按维度等分，扣除固定间距）
      const cellPx = Math.floor((size - GAP * (d - 1)) / d);
      const cellStyle = 'width:' + cellPx + 'px;height:' + cellPx + 'px;';
      const plusFont = Math.max(8, Math.floor(cellPx * 0.46));
      const plusStyle = cellStyle + 'font-size:' + plusFont + 'px;';

      // 按维度切分为行（末行不足时由 CSS 居中）
      const rows = [];
      for (let i = 0; i < cells.length; i += d) {
        rows.push(cells.slice(i, i + d));
      }

      this.setData({ rows: rows, cellStyle: cellStyle, plusStyle: plusStyle });
    }
  }
});
