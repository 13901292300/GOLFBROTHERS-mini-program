const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const temporaryCourse = require('../../../../../utils/temporaryCourse.js');

function emptyHoles() {
  const out = [];
  for (let i = 0; i < 18; i++) {
    out.push({ hole: i + 1, par: null, parText: '—' });
  }
  return out;
}

function cyclePar(current) {
  if (current === 3) return 4;
  if (current === 4) return 5;
  return 3;
}

function holesFromPars(pars) {
  return (pars || emptyHoles()).map((h, i) => {
    const par = h && h.par != null ? h.par : h;
    const n = typeof par === 'number' ? par : null;
    return {
      hole: i + 1,
      par: n,
      parText: n == null ? '—' : String(n)
    };
  });
}

Page({
  data: {
    themeClass: 'bright-mode',
    headerRootStyle: '',
    headerBarStyle: '',
    headerTotalHeight: 92,
    courseName: '',
    frontHoles: [],
    backHoles: [],
    totalParText: '—',
    canConfirm: false
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._holes = emptyHoles();
    this._syncHoles();
  },

  onShow() {
    this.applyTheme(getApp().getTheme());
  },

  applyTheme(theme) {
    this.setData({ themeClass: theme === 'dark' ? 'dark-mode' : 'bright-mode' });
  },

  initHeaderNav() {
    const header = createHeaderStyle();
    this.setData({
      headerRootStyle: header.headerRootStyle,
      headerBarStyle: header.headerBarStyle,
      headerTotalHeight: header.metrics.headerTotalHeight
    });
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.redirectTo({ url: '/subpackages/create/pages/course/select/index' });
    }
  },

  onNameInput(e) {
    this.setData({ courseName: e.detail.value || '' });
  },

  onCyclePar(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 17) return;
    const next = cyclePar(this._holes[idx].par);
    this._holes[idx].par = next;
    this._holes[idx].parText = String(next);
    this._syncHoles();
  },

  _syncHoles() {
    const holes = holesFromPars(this._holes);
    this._holes = holes;
    const pars = holes.map((h) => h.par);
    const valid = temporaryCourse.isValidHolePars(pars);
    this.setData({
      frontHoles: holes.slice(0, 9),
      backHoles: holes.slice(9, 18),
      totalParText: valid ? String(temporaryCourse.totalPar(pars)) : '—',
      canConfirm: valid
    });
  },

  onConfirm() {
    if (!this.data.canConfirm) return;
    const holePars = this._holes.map((h) => h.par);
    if (!temporaryCourse.isValidHolePars(holePars)) {
      wx.showToast({ title: '请完成18洞标准杆', icon: 'none' });
      return;
    }
    const payload = {
      courseSource: 'temporary',
      temporaryCourseId: temporaryCourse.nextTemporaryCourseId(),
      courseId: '',
      courseName: (this.data.courseName || '').trim(),
      front9Course: 'A',
      back9Course: 'B',
      holePars: holePars.slice()
    };
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && channel.emit) {
      channel.emit('courseSelected', payload);
    }
    wx.navigateBack({
      delta: 1,
      fail: () =>
        wx.redirectTo({ url: '/subpackages/create/pages/course/select/index' })
    });
  }
});
