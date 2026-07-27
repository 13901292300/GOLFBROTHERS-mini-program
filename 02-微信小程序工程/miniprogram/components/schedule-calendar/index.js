/**
 * schedule-calendar — 首页日程 TAB 年度日历展示组件（V1）
 *
 * 入参：year + eventsByDate
 * 出参：bind:dateTap → detail { date: "YYYY-MM-DD" }
 * 只负责生成 12 个月内容；滚动定位由页面 ds-scroll-main 负责。
 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** @returns {string} YYYY-MM-DD */
function formatDateKey(year, month, day) {
  return Number(year) + '-' + pad2(Number(month)) + '-' + pad2(Number(day));
}

function emptyCell() {
  return {
    empty: true,
    day: 0,
    date: '',
    isToday: false,
    hasEvent: false,
    isTodayEvent: false,
    isPastEvent: false,
    isSelected: false
  };
}

/**
 * 生成全年 12 个月格网（周日为一周起始；含月初/月末空白占位）
 * @param {number} year
 * @param {Object} eventsByDate
 * @param {string} selectedDate
 * @returns {Array}
 */
function buildYearCalendar(year, eventsByDate, selectedDate) {
  const y = Number(year) || new Date().getFullYear();
  const events =
    eventsByDate && typeof eventsByDate === 'object' ? eventsByDate : {};
  const selected = selectedDate != null ? String(selectedDate) : '';
  const today = new Date();
  const todayKey = formatDateKey(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  );
  const months = [];

  for (let month = 1; month <= 12; month++) {
    const firstDow = new Date(y, month - 1, 1).getDay(); // 0=日 … 6=六
    const dim = new Date(y, month, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push(emptyCell());
    }

    for (let day = 1; day <= dim; day++) {
      const date = formatDateKey(y, month, day);
      const list = events[date];
      const isToday = date === todayKey;
      const hasEvent = Array.isArray(list) && list.length > 0;
      const isPastEvent = hasEvent && !isToday && date < todayKey;
      cells.push({
        empty: false,
        day: day,
        date: date,
        isToday: isToday,
        hasEvent: hasEvent,
        isTodayEvent: isToday && hasEvent,
        isPastEvent: isPastEvent,
        isSelected: !!selected && date === selected
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(emptyCell());
    }

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }

    months.push({
      year: y,
      month: month,
      anchorId: 'month-' + month,
      title: month + '月',
      weeks: weeks
    });
  }

  return months;
}

Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    year: {
      type: Number,
      value: new Date().getFullYear()
    },
    eventsByDate: {
      type: Object,
      value: {}
    }
  },

  data: {
    months: [],
    weekLabels: ['日', '一', '二', '三', '四', '五', '六'],
    selectedDate: ''
  },

  observers: {
    year: function () {
      this._rebuild();
    },
    eventsByDate: function () {
      this._rebuild();
    }
  },

  lifetimes: {
    attached() {
      this._rebuild();
    }
  },

  methods: {
    formatDateKey: formatDateKey,

    buildYearCalendar: buildYearCalendar,

    _rebuild() {
      const year = this.properties.year;
      const eventsByDate = this.properties.eventsByDate;
      const selectedDate = this.data.selectedDate || '';
      this.setData({
        months: buildYearCalendar(year, eventsByDate, selectedDate)
      });
    },

    onDateTap(e) {
      const date =
        e && e.currentTarget && e.currentTarget.dataset
          ? e.currentTarget.dataset.date
          : '';
      if (!date) return;
      const key = String(date);
      this.setData({ selectedDate: key }, () => {
        this._rebuild();
      });
      this.triggerEvent('dateTap', { date: key });
    }
  }
});

module.exports = {
  formatDateKey: formatDateKey,
  buildYearCalendar: buildYearCalendar
};
