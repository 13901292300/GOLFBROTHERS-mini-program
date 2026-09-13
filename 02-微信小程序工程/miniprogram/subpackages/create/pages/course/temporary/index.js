const { createHeaderStyle } = require('../../../../../utils/headerEngine.js');
const temporaryCourse = require('../../../../../utils/temporaryCourse.js');
const parInputFocus = require('./parInputFocus.js');

function emptyPars() {
  const out = [];
  for (let i = 0; i < 18; i++) out.push(null);
  return out;
}

function holeViews(pars) {
  return (pars || emptyPars()).map((par, i) => {
    const n = temporaryCourse.isValidPar(par) ? temporaryCourse.normalizePar(par) : null;
    return {
      index: i,
      hole: i + 1,
      par: n,
      parText: n == null ? '' : String(n),
      filled: n != null
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
    courseKeys: temporaryCourse.VALID_COURSES.slice(),
    front9Course: 'A',
    back9Course: 'B',
    frontHoles: [],
    backHoles: [],
    front9ParTotal: 0,
    back9ParTotal: 0,
    totalPar: 0,
    duplicateCourseParError: false,
    canConfirm: false,
    focusedHoleIndex: null
  },

  onLoad() {
    this.initHeaderNav();
    this.applyTheme(getApp().getTheme());
    this._pars = emptyPars();
    this._front9Course = 'A';
    this._back9Course = 'B';
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

  onSelectFrontCourse(e) {
    const key = temporaryCourse.normalizeCourseKey(e.currentTarget.dataset.key);
    if (!key) return;
    this._front9Course = key;
    this._syncHoles({ focusedHoleIndex: null });
  },

  onSelectBackCourse(e) {
    const key = temporaryCourse.normalizeCourseKey(e.currentTarget.dataset.key);
    if (!key) return;
    this._back9Course = key;
    this._syncHoles({ focusedHoleIndex: null });
  },

  onParFocus(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 17) return;
    if (this.data.focusedHoleIndex === idx) return;
    this.setData({ focusedHoleIndex: idx });
  },

  onParInput(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(idx) || idx < 0 || idx > 17) return;
    const applied = parInputFocus.applyParInput({
      holePars: this._pars,
      index: idx,
      raw: e.detail && e.detail.value
    });
    this._pars = applied.holePars;
    this._syncHoles({ focusedHoleIndex: applied.focusedHoleIndex });
  },

  _syncHoles(extra) {
    const holes = holeViews(this._pars);
    this._pars = holes.map((h) => h.par);
    const pars = this._pars.slice();
    const front9Course = this._front9Course || 'A';
    const back9Course = this._back9Course || 'B';
    const payload = {
      courseSource: 'temporary',
      front9Course: front9Course,
      back9Course: back9Course,
      holePars: pars
    };
    const data = {
      front9Course: front9Course,
      back9Course: back9Course,
      frontHoles: holes.slice(0, 9),
      backHoles: holes.slice(9, 18),
      front9ParTotal: temporaryCourse.front9ParTotal(pars),
      back9ParTotal: temporaryCourse.back9ParTotal(pars),
      totalPar: temporaryCourse.totalPar(pars),
      duplicateCourseParError: temporaryCourse.hasConflictingDuplicateCourse(payload),
      canConfirm: temporaryCourse.isValidTemporaryCourse(payload)
    };
    if (extra && typeof extra === 'object') {
      Object.assign(data, extra);
    }
    this.setData(data);
  },

  onConfirm() {
    if (!this.data.canConfirm) return;
    const holePars = this._pars.slice();
    const payload = {
      courseSource: 'temporary',
      temporaryCourseId: temporaryCourse.nextTemporaryCourseId(),
      courseId: '',
      courseName: (this.data.courseName || '').trim(),
      front9Course: this._front9Course || 'A',
      back9Course: this._back9Course || 'B',
      holePars: holePars
    };
    if (!temporaryCourse.isValidTemporaryCourse(payload)) {
      wx.showToast({ title: '请完成18洞标准杆', icon: 'none' });
      return;
    }
    payload.holePars = temporaryCourse.cloneHolePars(holePars);
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
