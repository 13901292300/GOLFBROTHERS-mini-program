/**
 * 队内赛默认赛事信息 — 与 pages/create/team-internal 默认配置同源
 * 供创建页与演示赛事补齐复用，禁止在此另起一套文案。
 */

const eventSponsorConfig = require('./eventSponsorConfig.js');

const DEFAULT_EVENT_RULES_TEXT =
  '本次比赛采用国际高尔夫球联合会最新颁布的《高尔夫球规则》以及竞赛委员会制定的"比赛条件"和"当地规则"。比赛为单轮18洞个人比杆赛。';
const DEFAULT_EVENT_NOTICE_TEXT =
  '参赛球员需在开球前30分钟到达签到处领取记分卡，并准时在指定发球台出发。比赛过程中请保持良好的礼仪及球场速度。';

function createDefaultEventInfoList() {
  const sponsor1 = eventSponsorConfig.getDefaultEventSponsorSlot(0);
  const sponsor2 = eventSponsorConfig.getDefaultEventSponsorSlot(1);
  return [
    {
      id: 'evt-default-1',
      title: '广告图片1',
      type: 'image',
      content: '',
      brightImage: sponsor1.bright || '',
      darkImage: sponsor1.dark || '',
      status: '已设置'
    },
    {
      id: 'evt-default-2',
      title: '赛事规则',
      type: 'text',
      content: DEFAULT_EVENT_RULES_TEXT,
      brightImage: '',
      darkImage: '',
      status: '已设置'
    },
    {
      id: 'evt-default-3',
      title: '广告图片2',
      type: 'image',
      content: '',
      brightImage: sponsor2.bright || '',
      darkImage: sponsor2.dark || '',
      status: '已设置'
    },
    {
      id: 'evt-default-4',
      title: '参赛须知',
      type: 'text',
      content: DEFAULT_EVENT_NOTICE_TEXT,
      brightImage: '',
      darkImage: '',
      status: '已设置'
    }
  ];
}

function cloneEventInfoItem(item) {
  if (!item || typeof item !== 'object') {
    return {
      id: '',
      title: '',
      type: '',
      content: '',
      brightImage: '',
      darkImage: '',
      status: ''
    };
  }
  return {
    id: item.id != null ? String(item.id) : '',
    title: item.title ? String(item.title) : '',
    type: item.type ? String(item.type) : '',
    content: item.content != null ? String(item.content) : '',
    brightImage: item.brightImage != null
      ? String(item.brightImage)
      : (item.imageData != null ? String(item.imageData) : ''),
    darkImage: item.darkImage != null
      ? String(item.darkImage)
      : (item.imageData != null ? String(item.imageData) : ''),
    status: item.status ? String(item.status) : ''
  };
}

/** title 为主键；照片直播 ↔ 交通说明 视为同一项 */
function eventInfoItemKey(item) {
  const title = String((item && item.title) || '').trim();
  if (title === '照片直播' || title === '交通说明') return '照片直播';
  return title;
}

/** 文本看 content；图片看 bright/dark/imageData */
function hasValidEventInfoContent(item) {
  if (!item) return false;
  const type = String(item.type || '').trim();
  if (type === 'image') {
    const bright = String(item.brightImage != null ? item.brightImage : (item.imageData || '')).trim();
    const dark = String(item.darkImage != null ? item.darkImage : (item.imageData || '')).trim();
    return !!(bright || dark);
  }
  return String(item.content != null ? item.content : '').trim() !== '';
}

/**
 * 以 title（及照片直播别名）为键补齐默认赛事信息。
 * - target 有有效内容 → 保留
 * - target 缺失或内容为空 → 用 default 补入（不覆盖个性化）
 * - 跳过无有效内容的 default，避免空白卡片
 */
function mergeDefaultEventInfo(targetEventInfo, defaultEventInfo) {
  const result = (Array.isArray(targetEventInfo) ? targetEventInfo : [])
    .filter(Boolean)
    .map(cloneEventInfoItem);
  const defaults = Array.isArray(defaultEventInfo) ? defaultEventInfo : [];
  const indexByKey = {};
  result.forEach((item, index) => {
    const key = eventInfoItemKey(item);
    if (key) indexByKey[key] = index;
  });

  defaults.forEach((raw) => {
    const def = cloneEventInfoItem(raw);
    const key = eventInfoItemKey(def);
    if (!key || !hasValidEventInfoContent(def)) return;
    const idx = indexByKey[key];
    if (idx == null) {
      indexByKey[key] = result.length;
      result.push(def);
      return;
    }
    if (!hasValidEventInfoContent(result[idx])) {
      const prev = result[idx];
      result[idx] = Object.assign({}, def, {
        id: prev.id || def.id,
        title: prev.title || def.title,
        type: prev.type || def.type
      });
    }
  });

  return result;
}

module.exports = {
  DEFAULT_EVENT_RULES_TEXT,
  DEFAULT_EVENT_NOTICE_TEXT,
  createDefaultEventInfoList,
  cloneEventInfoItem,
  eventInfoItemKey,
  hasValidEventInfoContent,
  mergeDefaultEventInfo
};
