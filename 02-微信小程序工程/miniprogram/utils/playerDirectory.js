/**
 * 球员目录（演示数据源）。
 * - FRIEND_LIST：通讯录好友（含 pinyin，用于字母排序）
 * - PRESET_COMBOS：老牌组合（含 useCount，用于「使用频率最高」排序）
 * 说明：这是「明确标记来源」的演示目录，所有补位最终都以 playerId 强绑定到当前比赛的 slot，
 *      不与其它比赛 / leaderboard 数据源混用。
 */

const mockAvatars = require('./mockAvatars.js');

function friendEntry(playerId, name, remark, phone, pinyin, avatarIndex, extra) {
  return Object.assign(
    {
      playerId: playerId,
      name: name,
      remark: remark,
      phone: phone,
      avatar: mockAvatars.avatarByIndex(avatarIndex),
      pinyin: pinyin
    },
    extra || {}
  );
}

function comboPlayer(playerId, name) {
  const hit = FRIEND_LIST.find((f) => f.playerId === playerId);
  return {
    playerId: playerId,
    name: name,
    avatar: hit ? hit.avatar : mockAvatars.pickMockAvatar(playerId)
  };
}

const FRIEND_LIST = [
  friendEntry('fr-1001', 'Jordan', '乔老板', '13800001001', 'jordan', 0, { gender: 'male', country: 'USA', age: 29, flag: 'us' }),
  friendEntry('fr-1002', 'Rose', '玫瑰', '13800001002', 'rose', 1, { gender: 'female', country: 'ENG', age: 27, flag: 'gb-eng' }),
  friendEntry('fr-1003', '阿杰', '球场老司机', '13812345678', 'ajie', 2, { gender: 'male', country: 'CHN', age: 31, flag: 'cn' }),
  friendEntry('fr-1004', 'Mia', '米娅', '13800001004', 'mia', 3, { gender: 'female', country: 'AUS', age: 25, flag: 'au' }),
  friendEntry('fr-1005', '老张', '张哥', '13987654321', 'laozhang', 4, { gender: 'male', country: 'CHN', age: 45, flag: 'cn' }),
  friendEntry('fr-1006', 'Kevin', '凯文', '13800001006', 'kevin', 5, { gender: 'male', country: 'CAN', age: 33, flag: 'ca' }),
  friendEntry('fr-1007', 'Bella', '贝拉', '13800001007', 'bella', 6, { gender: 'female', country: 'ESP', age: 28, flag: 'es' }),
  friendEntry('fr-1008', '陈浩', '浩子', '13711112222', 'chenhao', 7, { gender: 'male', country: 'CHN', age: 30, flag: 'cn' }),
  friendEntry('fr-1009', 'David', '大卫', '13800001009', 'david', 8, { gender: 'male', country: 'USA', age: 36, flag: 'us' }),
  friendEntry('fr-1010', '王磊', '磊哥', '13633334444', 'wanglei', 9, { gender: 'male', country: 'CHN', age: 38, flag: 'cn' }),
  friendEntry('fr-1011', 'Frank', '弗兰克', '13800001011', 'frank', 0, { gender: 'male', country: 'GER', age: 41, flag: 'de' }),
  friendEntry('fr-1012', '赵敏', '敏敏', '13555556666', 'zhaomin', 1, { gender: 'female', country: 'CHN', age: 26, flag: 'cn' })
];

const PRESET_COMBOS = [
  {
    id: 'combo-fixed4',
    name: '常用四人组',
    desc: '固定球友 · 4 人',
    useCount: 42,
    players: [
      comboPlayer('fr-1001', 'Jordan'),
      comboPlayer('fr-1002', 'Rose'),
      comboPlayer('fr-1003', '阿杰'),
      comboPlayer('fr-1005', '老张')
    ]
  },
  {
    id: 'combo-last',
    name: '上次比赛组合',
    desc: '沿用上一场 · 3 人',
    useCount: 31,
    players: [
      comboPlayer('fr-1004', 'Mia'),
      comboPlayer('fr-1006', 'Kevin'),
      comboPlayer('fr-1003', '阿杰')
    ]
  },
  {
    id: 'combo-weekend',
    name: '周末球友',
    desc: '周末固定局 · 4 人',
    useCount: 27,
    players: [
      comboPlayer('fr-1007', 'Bella'),
      comboPlayer('fr-1008', '陈浩'),
      comboPlayer('fr-1009', 'David'),
      comboPlayer('fr-1010', '王磊')
    ]
  },
  {
    id: 'combo-company',
    name: '公司球队',
    desc: '同事局 · 4 人',
    useCount: 19,
    players: [
      comboPlayer('fr-1011', 'Frank'),
      comboPlayer('fr-1012', '赵敏'),
      comboPlayer('fr-1001', 'Jordan'),
      comboPlayer('fr-1004', 'Mia')
    ]
  },
  {
    id: 'combo-pair',
    name: '老搭档',
    desc: '双人局 · 2 人',
    useCount: 14,
    players: [comboPlayer('fr-1002', 'Rose'), comboPlayer('fr-1005', '老张')]
  },
  {
    id: 'combo-tour',
    name: '巡回赛常客',
    desc: '比赛局 · 4 人',
    useCount: 11,
    players: [
      comboPlayer('fr-1003', '阿杰'),
      comboPlayer('fr-1006', 'Kevin'),
      comboPlayer('fr-1008', '陈浩'),
      comboPlayer('fr-1011', 'Frank')
    ]
  },
  {
    id: 'combo-rookie',
    name: '新手陪练',
    desc: '练习局 · 3 人',
    useCount: 6,
    players: [
      comboPlayer('fr-1007', 'Bella'),
      comboPlayer('fr-1009', 'David'),
      comboPlayer('fr-1010', '王磊')
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
