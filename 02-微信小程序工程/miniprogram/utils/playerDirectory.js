/**
 * 球员目录（演示数据源）。
 * - FRIEND_LIST：通讯录好友（含 pinyin，用于字母排序）
 * - PRESET_COMBOS：老牌组合（含 useCount，用于「使用频率最高」排序）
 * 说明：这是「明确标记来源」的演示目录，所有补位最终都以 playerId 强绑定到当前比赛的 slot，
 *      不与其它比赛 / leaderboard 数据源混用。
 */

const FRIEND_LIST = [
  { playerId: 'fr-1001', name: 'Jordan', remark: '乔老板', phone: '13800001001', avatar: 'https://i.pravatar.cc/150?img=51', pinyin: 'jordan', gender: 'male', country: 'USA', age: 29, flag: 'us' },
  { playerId: 'fr-1002', name: 'Rose', remark: '玫瑰', phone: '13800001002', avatar: 'https://i.pravatar.cc/150?img=52', pinyin: 'rose', gender: 'female', country: 'ENG', age: 27, flag: 'gb-eng' },
  { playerId: 'fr-1003', name: '阿杰', remark: '球场老司机', phone: '13812345678', avatar: 'https://i.pravatar.cc/150?img=53', pinyin: 'ajie', gender: 'male', country: 'CHN', age: 31, flag: 'cn' },
  { playerId: 'fr-1004', name: 'Mia', remark: '米娅', phone: '13800001004', avatar: 'https://i.pravatar.cc/150?img=54', pinyin: 'mia', gender: 'female', country: 'AUS', age: 25, flag: 'au' },
  { playerId: 'fr-1005', name: '老张', remark: '张哥', phone: '13987654321', avatar: 'https://i.pravatar.cc/150?img=55', pinyin: 'laozhang', gender: 'male', country: 'CHN', age: 45, flag: 'cn' },
  { playerId: 'fr-1006', name: 'Kevin', remark: '凯文', phone: '13800001006', avatar: 'https://i.pravatar.cc/150?img=56', pinyin: 'kevin', gender: 'male', country: 'CAN', age: 33, flag: 'ca' },
  { playerId: 'fr-1007', name: 'Bella', remark: '贝拉', phone: '13800001007', avatar: 'https://i.pravatar.cc/150?img=57', pinyin: 'bella', gender: 'female', country: 'ESP', age: 28, flag: 'es' },
  { playerId: 'fr-1008', name: '陈浩', remark: '浩子', phone: '13711112222', avatar: 'https://i.pravatar.cc/150?img=58', pinyin: 'chenhao', gender: 'male', country: 'CHN', age: 30, flag: 'cn' },
  { playerId: 'fr-1009', name: 'David', remark: '大卫', phone: '13800001009', avatar: 'https://i.pravatar.cc/150?img=59', pinyin: 'david', gender: 'male', country: 'USA', age: 36, flag: 'us' },
  { playerId: 'fr-1010', name: '王磊', remark: '磊哥', phone: '13633334444', avatar: 'https://i.pravatar.cc/150?img=60', pinyin: 'wanglei', gender: 'male', country: 'CHN', age: 38, flag: 'cn' },
  { playerId: 'fr-1011', name: 'Frank', remark: '弗兰克', phone: '13800001011', avatar: 'https://i.pravatar.cc/150?img=61', pinyin: 'frank', gender: 'male', country: 'GER', age: 41, flag: 'de' },
  { playerId: 'fr-1012', name: '赵敏', remark: '敏敏', phone: '13555556666', avatar: 'https://i.pravatar.cc/150?img=62', pinyin: 'zhaomin', gender: 'female', country: 'CHN', age: 26, flag: 'cn' }
];

const PRESET_COMBOS = [
  {
    id: 'combo-fixed4',
    name: '常用四人组',
    desc: '固定球友 · 4 人',
    useCount: 42,
    players: [
      { playerId: 'fr-1001', name: 'Jordan', avatar: 'https://i.pravatar.cc/150?img=51' },
      { playerId: 'fr-1002', name: 'Rose', avatar: 'https://i.pravatar.cc/150?img=52' },
      { playerId: 'fr-1003', name: '阿杰', avatar: 'https://i.pravatar.cc/150?img=53' },
      { playerId: 'fr-1005', name: '老张', avatar: 'https://i.pravatar.cc/150?img=55' }
    ]
  },
  {
    id: 'combo-last',
    name: '上次比赛组合',
    desc: '沿用上一场 · 3 人',
    useCount: 31,
    players: [
      { playerId: 'fr-1004', name: 'Mia', avatar: 'https://i.pravatar.cc/150?img=54' },
      { playerId: 'fr-1006', name: 'Kevin', avatar: 'https://i.pravatar.cc/150?img=56' },
      { playerId: 'fr-1003', name: '阿杰', avatar: 'https://i.pravatar.cc/150?img=53' }
    ]
  },
  {
    id: 'combo-weekend',
    name: '周末球友',
    desc: '周末固定局 · 4 人',
    useCount: 27,
    players: [
      { playerId: 'fr-1007', name: 'Bella', avatar: 'https://i.pravatar.cc/150?img=57' },
      { playerId: 'fr-1008', name: '陈浩', avatar: 'https://i.pravatar.cc/150?img=58' },
      { playerId: 'fr-1009', name: 'David', avatar: 'https://i.pravatar.cc/150?img=59' },
      { playerId: 'fr-1010', name: '王磊', avatar: 'https://i.pravatar.cc/150?img=60' }
    ]
  },
  {
    id: 'combo-company',
    name: '公司球队',
    desc: '同事局 · 4 人',
    useCount: 19,
    players: [
      { playerId: 'fr-1011', name: 'Frank', avatar: 'https://i.pravatar.cc/150?img=61' },
      { playerId: 'fr-1012', name: '赵敏', avatar: 'https://i.pravatar.cc/150?img=62' },
      { playerId: 'fr-1001', name: 'Jordan', avatar: 'https://i.pravatar.cc/150?img=51' },
      { playerId: 'fr-1004', name: 'Mia', avatar: 'https://i.pravatar.cc/150?img=54' }
    ]
  },
  {
    id: 'combo-pair',
    name: '老搭档',
    desc: '双人局 · 2 人',
    useCount: 14,
    players: [
      { playerId: 'fr-1002', name: 'Rose', avatar: 'https://i.pravatar.cc/150?img=52' },
      { playerId: 'fr-1005', name: '老张', avatar: 'https://i.pravatar.cc/150?img=55' }
    ]
  },
  {
    id: 'combo-tour',
    name: '巡回赛常客',
    desc: '比赛局 · 4 人',
    useCount: 11,
    players: [
      { playerId: 'fr-1003', name: '阿杰', avatar: 'https://i.pravatar.cc/150?img=53' },
      { playerId: 'fr-1006', name: 'Kevin', avatar: 'https://i.pravatar.cc/150?img=56' },
      { playerId: 'fr-1008', name: '陈浩', avatar: 'https://i.pravatar.cc/150?img=58' },
      { playerId: 'fr-1011', name: 'Frank', avatar: 'https://i.pravatar.cc/150?img=61' }
    ]
  },
  {
    id: 'combo-rookie',
    name: '新手陪练',
    desc: '练习局 · 3 人',
    useCount: 6,
    players: [
      { playerId: 'fr-1007', name: 'Bella', avatar: 'https://i.pravatar.cc/150?img=57' },
      { playerId: 'fr-1009', name: 'David', avatar: 'https://i.pravatar.cc/150?img=59' },
      { playerId: 'fr-1010', name: '王磊', avatar: 'https://i.pravatar.cc/150?img=60' }
    ]
  }
];

// 一个 friend playerId 集合，用于判定某个 slot 是否「好友来源」
const FRIEND_ID_SET = FRIEND_LIST.reduce((m, f) => {
  m[f.playerId] = true;
  return m;
}, {});

// playerId → 资料映射（演示数据；slot 仅存 playerId 时据此回查性别/国家/年龄/旗帜）
const PROFILE_BY_ID = FRIEND_LIST.reduce((m, f) => {
  m[f.playerId] = {
    gender: f.gender || 'male',
    country: f.country || '',
    age: f.age || '',
    flag: f.flag || ''
  };
  return m;
}, {});

// 性别回查：优先用 slot 自带 gender，其次目录映射，默认 male
function getGenderById(playerId, fallbackGender) {
  if (fallbackGender === 'female' || fallbackGender === 'male') return fallbackGender;
  return (PROFILE_BY_ID[playerId] && PROFILE_BY_ID[playerId].gender) || 'male';
}

// 完整资料回查：优先 slot 自带字段，其次目录映射，缺失给安全兜底（与球队榜字段一致）
function getProfileById(playerId, fallback) {
  const base = PROFILE_BY_ID[playerId] || {};
  const fb = fallback || {};
  return {
    gender: fb.gender === 'female' || fb.gender === 'male' ? fb.gender : (base.gender || 'male'),
    country: fb.country || base.country || '',
    age: fb.age || base.age || '',
    flag: fb.flag || base.flag || ''
  };
}

module.exports = {
  FRIEND_LIST,
  PRESET_COMBOS,
  FRIEND_ID_SET,
  PROFILE_BY_ID,
  getGenderById,
  getProfileById
};
