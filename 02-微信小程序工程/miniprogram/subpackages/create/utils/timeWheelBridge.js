/**
 * 创建类页面接入 time-wheel-picker 的共用桥接逻辑。
 * 页面只需：注册组件、绑定 WXML、调用此处方法完成字段映射。
 */

const createTeeTimeNow = require('../../../utils/createTeeTimeNow.js');
const MINUTE_VALUES = createTeeTimeNow.MINUTE_VALUES;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseTimeToDraft(timeString) {
  return createTeeTimeNow.parseTimeToDraftForWheel(timeString);
}

function formatDateTime(draft) {
  return (
    draft.year +
    '-' +
    pad2(draft.month) +
    '-' +
    pad2(draft.day) +
    ' ' +
    pad2(draft.hour) +
    ':' +
    pad2(draft.minute)
  );
}

function minuteSlotIndex(minute) {
  const idx = MINUTE_VALUES.indexOf(minute);
  return idx < 0 ? 0 : idx;
}

function buildWheelPayload(draft) {
  const rounded = createTeeTimeNow.roundDraftToTenMinutes(draft);
  if (draft) {
    draft.year = rounded.year;
    draft.month = rounded.month;
    draft.day = rounded.day;
    draft.hour = rounded.hour;
    draft.minute = rounded.minute;
  }
  const t = draft || rounded;
  const months = Array.from({ length: 12 }, (_, i) => pad2(i + 1));
  const dayCount = daysInMonth(t.year, t.month);
  const days = Array.from({ length: dayCount }, (_, i) => pad2(i + 1));
  const hours = Array.from({ length: 24 }, (_, i) => pad2(i));
  const minutes = MINUTE_VALUES.map((m) => pad2(m));
  const minuteIdx = minuteSlotIndex(t.minute);
  const hourIdx = createTeeTimeNow.clampInt(t.hour, 0, 23);
  const teeIndex = [t.month - 1, t.day - 1, hourIdx, minuteIdx];

  return {
    teeYear: t.year,
    timeDraft: Object.assign({}, t),
    months,
    days,
    hours,
    minutes,
    teeIndex,
    timePickerValue: teeIndex,
    wheelIndex: teeIndex
  };
}

function applyPickerValue(draft, value) {
  const t = draft;
  const raw = Array.isArray(value) ? value : [];
  const mIdx = createTeeTimeNow.clampInt(raw[0], 0, 11);
  const hIdx = createTeeTimeNow.clampInt(raw[2], 0, 23);
  const minIdx = createTeeTimeNow.clampInt(raw[3], 0, MINUTE_VALUES.length - 1);
  t.month = mIdx + 1;
  t.hour = hIdx;
  t.minute = MINUTE_VALUES[minIdx];

  const dayCount = daysInMonth(t.year, t.month);
  let dayIdx = createTeeTimeNow.clampInt(raw[1], 0, dayCount - 1);
  t.day = dayIdx + 1;

  const days = Array.from({ length: dayCount }, (_, i) => pad2(i + 1));
  const teeIndex = [mIdx, dayIdx, hIdx, minIdx];

  return {
    draft: t,
    days,
    teeIndex,
    timeDraft: Object.assign({}, t)
  };
}

/** 单开球时间字段（普通创建等） */
function singleFieldPageData(overrides) {
  return Object.assign(
    {
      showTimePicker: false,
      teeYear: 0,
      months: [],
      days: [],
      hours: [],
      minutes: [],
      teeIndex: [0, 0, 0, 0],
      timeDraft: { year: 0, month: 1, day: 1, hour: 0, minute: 0 }
    },
    overrides || {}
  );
}

function initSingleFieldPage(page, defaultTime) {
  page._editingTime = defaultTime
    ? parseTimeToDraft(defaultTime)
    : createTeeTimeNow.cloneParts(createTeeTimeNow.partsFromDate());
  page._timeStore = Object.assign({}, page._editingTime);
}

/** 开球时间 + 报名截止（队内赛 / 队际赛 / 系列赛等） */
function dualFieldPageData(overrides) {
  return Object.assign(
    {
      showTimePicker: false,
      activeTimeTarget: 'tee',
      timePickerTitle: '选择开球时间',
      teeYear: 0,
      months: [],
      days: [],
      hours: [],
      minutes: [],
      teeIndex: [0, 0, 0, 0],
      timeDraft: { year: 0, month: 1, day: 1, hour: 0, minute: 0 },
      teeTime: '',
      deadlineTime: '',
      teeTimeText: '',
      deadlineTimeText: ''
    },
    overrides || {}
  );
}

function initDualFieldPage(page, defaults) {
  const created = createTeeTimeNow.buildCreateTimes();
  const src = defaults || {};
  const storedTee = createTeeTimeNow.resolveStoredDraft(src.teeTime, src.teeTimeText);
  const storedDeadline = createTeeTimeNow.resolveStoredDraft(
    src.deadlineTime,
    src.deadlineTimeText
  );
  page._tee = storedTee || created.tee;
  page._deadline = storedDeadline || created.deadline;
  page._editingTime = Object.assign({}, page._tee);
  page._activeTimeTarget = 'tee';
}

function createSingleFieldMethods(options) {
  const showKey = (options && options.showKey) || 'showTimePicker';
  const getTimeString =
    (options && options.getTimeString) ||
    function () {
      return this.data.teeTimeText || this.data.teeTime || '';
    };
  const formatFn = (options && options.formatFn) || formatDateTime;
  const onConfirm =
    (options && options.onConfirm) ||
    function (page, text, draft) {
      page._timeStore = Object.assign({}, draft);
      page.setData({
        teeTimeText: text,
        teeTime: text,
        [showKey]: false
      });
    };

  return {
    _buildWheels() {
      this.setData(buildWheelPayload(this._editingTime));
    },
    openTimePicker() {
      this._editingTime = Object.assign({}, parseTimeToDraft(getTimeString.call(this)));
      this.setData(
        Object.assign({}, buildWheelPayload(this._editingTime), { [showKey]: true })
      );
    },
    closeTimePicker() {
      this.setData({ [showKey]: false });
    },
    onTimePickerChange(e) {
      const result = applyPickerValue(this._editingTime, e.detail.value);
      this._editingTime = result.draft;
      this.setData({
        days: result.days,
        teeIndex: result.teeIndex,
        timePickerValue: result.teeIndex,
        timeDraft: result.timeDraft
      });
    },
    onTimePickerYearChange(e) {
      this._editingTime.year += Number(e.detail.delta);
      this._buildWheels();
    },
    confirmTimePicker() {
      const text = formatFn(this._editingTime);
      onConfirm(this, text, this._editingTime);
    }
  };
}

function createDualFieldMethods() {
  return {
    _buildWheels() {
      this.setData(buildWheelPayload(this._editingTime));
    },
    openTimePicker(e) {
      const target = (e && e.currentTarget && e.currentTarget.dataset.target) || 'tee';
      const isDeadline = target === 'deadline' || target === 'deadlineTime';
      const timeString = isDeadline ? this.data.deadlineTime : this.data.teeTime;
      this._editingTime = Object.assign({}, parseTimeToDraft(timeString));
      this._activeTimeTarget = isDeadline ? 'deadline' : 'tee';
      const title = isDeadline ? '选择报名截止时间' : '选择开球时间';
      this.setData(
        Object.assign({}, buildWheelPayload(this._editingTime), {
          showTimePicker: true,
          activeTimeTarget: target,
          timePickerTitle: title
        })
      );
    },
    closeTimePicker() {
      this.setData({ showTimePicker: false });
    },
    onTimePickerChange(e) {
      const result = applyPickerValue(this._editingTime, e.detail.value);
      this._editingTime = result.draft;
      this.setData({
        days: result.days,
        teeIndex: result.teeIndex,
        timePickerValue: result.teeIndex,
        timeDraft: result.timeDraft
      });
    },
    onTimePickerYearChange(e) {
      this._editingTime.year += Number(e.detail.delta);
      this._buildWheels();
    },
    confirmTimePicker() {
      const text = formatDateTime(this._editingTime);
      const target = this._activeTimeTarget || this.data.activeTimeTarget;

      if (target === 'deadline' || target === 'deadlineTime') {
        this._deadline = Object.assign({}, this._editingTime);
        this.setData({
          deadlineTime: text,
          deadlineTimeText: text,
          showTimePicker: false
        });
      } else {
        this._tee = Object.assign({}, this._editingTime);
        this.setData({
          teeTime: text,
          teeTimeText: text,
          showTimePicker: false
        });
      }
    }
  };
}

module.exports = {
  MINUTE_VALUES,
  pad2,
  daysInMonth,
  parseTimeToDraft,
  formatDateTime,
  buildWheelPayload,
  applyPickerValue,
  singleFieldPageData,
  initSingleFieldPage,
  dualFieldPageData,
  initDualFieldPage,
  createSingleFieldMethods,
  createDualFieldMethods
};
