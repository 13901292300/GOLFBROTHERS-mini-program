/**
 * 球场数据库（course database）。真实接入时替换为后端球场库；
 * lat/lng 用于附近 TAB 的 GPS 距离计算，useCount/lastUsed 为该用户的历史使用记录。
 */

const COURSE_DB = [
  {
    courseId: 'BJCC_GOLF_001',
    courseName: '北京乡村高尔夫俱乐部',
    location: '北京 · 密云',
    lat: 40.376,
    lng: 116.844,
    useCount: 20,
    lastUsed: '2026-06-25',
    pinyin: 'beijingxiangcungaoerfujulebu',
    abbr: 'bjcc',
    halfCourseCount: 6,
    halfCourses: [
      { code: 'A', name: 'Forest A', holes: 9, par: [4, 5, 3, 4, 4, 4, 3, 5, 4] },
      { code: 'B', name: 'Lake B', holes: 9, par: [4, 4, 3, 5, 4, 4, 3, 4, 5] },
      { code: 'C', name: 'Hill C', holes: 9, par: [5, 4, 4, 3, 4, 4, 5, 3, 4] },
      { code: 'D', name: 'River D', holes: 9, par: [4, 3, 4, 5, 4, 3, 4, 4, 5] },
      { code: 'E', name: 'Valley E', holes: 9, par: [4, 4, 5, 3, 4, 4, 4, 3, 5] },
      { code: 'F', name: 'Championship F', holes: 9, par: [4, 4, 3, 4, 5, 4, 3, 5, 4] }
    ]
  },
  { courseId: 'c-qhw', courseName: '北京清河湾高尔夫乡村俱乐部 A&B', location: '北京 · 昌平', lat: 40.218, lng: 116.231, useCount: 18, lastUsed: '2026-06-21', pinyin: 'beijingqinghewangaoerfuxiangcunjulebu', abbr: 'qhw', halfCourseCount: 2 },
  {
    courseId: 'c-honghua',
    courseName: '北京清河湾乡村高尔夫俱乐部C&D',
    location: '北京 · 昌平',
    lat: 40.218,
    lng: 116.231,
    useCount: 17,
    lastUsed: '2026-06-20',
    pinyin: 'beijingqinghewanxiangcungaoerfujulebucd honghua honghuagaoerfuqiuhui',
    abbr: 'qhwcd',
    searchKeys: '红花 红花高尔夫 c&d cd',
    halfCourseCount: 2,
    halfCourses: [
      { code: 'C', name: 'C', holes: 9, par: [4, 4, 4, 4, 4, 3, 5, 4, 5] },
      { code: 'D', name: 'D', holes: 9, par: [4, 3, 5, 3, 4, 5, 3, 4, 4] }
    ]
  },
  { courseId: 'c-huatang', courseName: '华堂高尔夫俱乐部', location: '北京 · 顺义', lat: 40.128, lng: 116.654, useCount: 12, lastUsed: '2026-06-09', pinyin: 'huatanggaoerfujulebu', abbr: 'ht', halfCourseCount: 2 },
  { courseId: 'c-pinevalley', courseName: '北京松山乡村俱乐部', location: '北京 · 延庆', lat: 40.456, lng: 115.974, useCount: 9, lastUsed: '2026-05-30', pinyin: 'beijingsongshanxiangcunjulebu', abbr: 'ss', halfCourseCount: 3 },
  { courseId: 'c-jiuhua', courseName: '九华山庄高尔夫', location: '北京 · 昌平', lat: 40.176, lng: 116.272, useCount: 6, lastUsed: '2026-05-02', pinyin: 'jiuhuashanzhuanggaoerfu', abbr: 'jhsz', halfCourseCount: 3 },
  { courseId: 'c-laguna', courseName: '北京拉斐特城堡高尔夫', location: '北京 · 昌平', lat: 40.205, lng: 116.118, useCount: 5, lastUsed: '2026-04-21', pinyin: 'beijinglafeitechengbaogaoerfu', abbr: 'lft', halfCourseCount: 4 },
  { courseId: 'c-changping', courseName: '北京高尔夫俱乐部', location: '北京 · 朝阳', lat: 40.012, lng: 116.498, useCount: 4, lastUsed: '2026-04-08', pinyin: 'beijinggaoerfujulebu', abbr: 'bj', halfCourseCount: 2 },
  { courseId: 'c-wanliu', courseName: '万柳高尔夫俱乐部', location: '北京 · 海淀', lat: 39.974, lng: 116.288, useCount: 3, lastUsed: '2026-03-22', pinyin: 'wanliugaoerfujulebu', abbr: 'wl', halfCourseCount: 1 },
  { courseId: 'c-orient', courseName: '东方明珠高尔夫', location: '北京 · 通州', lat: 39.902, lng: 116.667, useCount: 3, lastUsed: '2026-03-05', pinyin: 'dongfangmingzhugaoerfu', abbr: 'dfmz', halfCourseCount: 3 },
  { courseId: 'c-nankou', courseName: '南口农场高尔夫练习场', location: '北京 · 昌平', lat: 40.244, lng: 116.143, useCount: 2, lastUsed: '2026-02-18', pinyin: 'nankounongchanggaoerfulianxichang', abbr: 'nk', halfCourseCount: 1 },
  { courseId: 'c-lake', courseName: '京北湖滨高尔夫', location: '北京 · 怀柔', lat: 40.378, lng: 116.631, useCount: 2, lastUsed: '2026-02-01', pinyin: 'jingbeihubingaoerfu', abbr: 'jbhb', halfCourseCount: 2 },
  { courseId: 'c-county', courseName: '京都高尔夫俱乐部', location: '北京 · 平谷', lat: 40.142, lng: 117.121, useCount: 1, lastUsed: '2026-01-12', pinyin: 'jingdugaoerfujulebu', abbr: 'jd', halfCourseCount: 3 },
  {
    courseId: 'c-xinghewan',
    courseName: '星河湾国际高尔夫俱乐部',
    location: '湖南 · 长沙',
    useCount: 0,
    lastUsed: '',
    pinyin: 'xinghewanguojigaoerfujulebu',
    abbr: 'xhw',
    searchKeys: '星河湾 星河湾国际 长沙 湖南 xinghewan',
    halfCourseCount: 3,
    halfCourses: [
      { code: 'A', name: 'A', holes: 9, par: [4, 3, 4, 5, 4, 4, 5, 3, 4] },
      { code: 'B', name: 'B', holes: 9, par: [4, 5, 4, 5, 3, 4, 4, 3, 4] },
      { code: 'C', name: 'C', holes: 9, par: [4, 3, 4, 4, 5, 4, 3, 4, 5] }
    ]
  }
];

const FALLBACK_ORIGIN = { lat: 39.9087, lng: 116.3975 };
const UNKNOWN_DISTANCE_TEXT = '距离未知';
const NEARBY_LIMIT = 10;

function hasCoords(point) {
  return Number.isFinite(Number(point && point.lat)) && Number.isFinite(Number(point && point.lng));
}

function distanceKm(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 展示用距离：仅 Number.isFinite 可出数字文案；未知统一「距离未知」，不写 Infinity/NaN。 */
function formatDistanceMeta(km) {
  if (!Number.isFinite(Number(km))) {
    return {
      known: false,
      distance: null,
      distanceText: UNKNOWN_DISTANCE_TEXT,
      metaText: UNKNOWN_DISTANCE_TEXT
    };
  }
  const d = Number(km);
  const eta = Math.max(1, Math.round((d / 40) * 60));
  const distanceText = d.toFixed(1) + ' km';
  return {
    known: true,
    distance: d,
    distanceText: distanceText,
    metaText: distanceText + ' · 约 ' + eta + ' 分钟'
  };
}

function compareDistanceMeta(a, b) {
  const aKnown = a && a.known ? 0 : 1;
  const bKnown = b && b.known ? 0 : 1;
  if (aKnown !== bKnown) return aKnown - bKnown;
  if (aKnown === 0) return a.distance - b.distance;
  return 0;
}

function buildCourseDistanceViews(origin, courses, limit) {
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : NEARBY_LIMIT;
  const rows = (courses || []).map((c) => {
    const fmt = formatDistanceMeta(distanceKm(origin, c));
    return { c: c, fmt: fmt };
  });
  const distanceMap = {};
  rows.forEach((row) => {
    distanceMap[row.c.courseId] = row.fmt;
  });
  const nearbyCourses = rows
    .slice()
    .sort((a, b) => compareDistanceMeta(a.fmt, b.fmt))
    .slice(0, cap)
    .map((row) => ({
      courseId: row.c.courseId,
      courseName: row.c.courseName,
      location: row.c.location,
      distance: row.fmt.distance,
      distanceText: row.fmt.distanceText,
      metaText: row.fmt.metaText
    }));
  return { distanceMap: distanceMap, nearbyCourses: nearbyCourses };
}

/** 取球场前两个 COURSE 作为前9/后9（与球场选择页 buildHalves 规则一致） */
function resolveFirstTwoCourses(course) {
  if (!course) return { front9Course: null, back9Course: null, halfText: '' };
  if (Array.isArray(course.halfCourses) && course.halfCourses.length) {
    const front9 = course.halfCourses[0] ? course.halfCourses[0].code : null;
    const back9 = course.halfCourses[1] ? course.halfCourses[1].code : null;
    const halfText = front9 && back9 ? front9 + '/' + back9 : front9 || back9 || '';
    return { front9Course: front9, back9Course: back9, halfText: halfText };
  }
  const count = course.halfCourseCount || 0;
  const front9 = count >= 1 ? 'A' : null;
  const back9 = count >= 2 ? 'B' : null;
  const halfText = front9 && back9 ? front9 + '/' + back9 : front9 || back9 || '';
  return { front9Course: front9, back9Course: back9, halfText: halfText };
}

function findNearestCourse(origin) {
  const o = origin || FALLBACK_ORIGIN;
  let nearest = null;
  let minDist = Infinity;
  COURSE_DB.forEach((c) => {
    if (!hasCoords(c)) return;
    const d = distanceKm(o, c);
    if (!Number.isFinite(d)) return;
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  });
  return nearest;
}

function getNearestCourseWithHalves(origin) {
  const course = findNearestCourse(origin);
  if (!course) return null;
  const halves = resolveFirstTwoCourses(course);
  return {
    courseId: course.courseId,
    courseName: course.courseName,
    courseLocation: course.location,
    front9Course: halves.front9Course,
    back9Course: halves.back9Course,
    halfText: halves.halfText
  };
}

function locateNearestCourseWithHalves() {
  return new Promise((resolve) => {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => resolve(getNearestCourseWithHalves({ lat: res.latitude, lng: res.longitude })),
      fail: () => resolve(getNearestCourseWithHalves(FALLBACK_ORIGIN))
    });
  });
}

module.exports = {
  COURSE_DB,
  FALLBACK_ORIGIN,
  UNKNOWN_DISTANCE_TEXT,
  NEARBY_LIMIT,
  hasCoords,
  distanceKm,
  formatDistanceMeta,
  buildCourseDistanceViews,
  resolveFirstTwoCourses,
  findNearestCourse,
  getNearestCourseWithHalves,
  locateNearestCourseWithHalves
};
