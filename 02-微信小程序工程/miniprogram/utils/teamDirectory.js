const mockAvatars = require('./mockAvatars.js');

// TODO：搜索球队接口 — 当前为本地 mock 列表
const TEAMS = [
  { id: '1', name: '北京湘鹰高尔夫俱乐部', role: '超级管理员', region: '北京', memberCount: 128, isMine: true },
  { id: '2', name: '星途高尔夫俱乐部', role: '管理员', region: '上海', memberCount: 86, isMine: true },
  { id: '3', name: '江湖俱乐部', role: '成员', region: '深圳', memberCount: 64, isMine: true },
  { id: '4', name: '银河队', role: '成员', region: '广州', memberCount: 42, isMine: false },
  { id: '5', name: '六字头俱乐部', role: '成员', region: '杭州', memberCount: 37, isMine: false },
  { id: '6', name: '火星队', role: '成员', region: '成都', memberCount: 29, isMine: false },
  { id: '7', name: '太阳花', role: '成员', region: '南京', memberCount: 21, isMine: false }
];

/** 用户在前端 mock 创建的球队（插入列表顶部） */
let createdTeams = [];

/**
 * Patch 7：球队成员 mock 花名册（按 teamId）
 * 稳定 userId/playerId；与 teamGroups / create.normal teams[].members 无关
 */
const TEAM_MEMBERS_BY_TEAM_ID = {
  '1': [
    { playerId: 'tm-1001', name: '周启明', phone: '13800001001', gender: 'male', pinyin: 'zhouqiming' },
    { playerId: 'tm-1002', name: '林晓雯', phone: '13800001002', gender: 'female', pinyin: 'linxiaowen' },
    { playerId: 'tm-1003', name: '韩磊', phone: '13800001003', gender: 'male', pinyin: 'hanlei' },
    { playerId: 'tm-1004', name: '苏晴', phone: '13800001004', gender: 'female', pinyin: 'suqing' },
    { playerId: 'tm-1005', name: '马俊杰', phone: '13800001005', gender: 'male', pinyin: 'majunjie' },
    { playerId: 'tm-1006', name: '何雨桐', phone: '13800001006', gender: 'female', pinyin: 'heyutong' },
    { playerId: 'tm-1007', name: '邓凯', phone: '13800001007', gender: 'male', pinyin: 'dengkai' },
    { playerId: 'tm-1008', name: '曹一凡', phone: '13800001008', gender: 'male', pinyin: 'caoyifan' }
  ],
  '2': [
    { playerId: 'tm-2001', name: '沈浩', phone: '13800002001', gender: 'male', pinyin: 'shenhao' },
    { playerId: 'tm-2002', name: '顾婉清', phone: '13800002002', gender: 'female', pinyin: 'guwanqing' },
    { playerId: 'tm-2003', name: '陆明远', phone: '13800002003', gender: 'male', pinyin: 'lumingyuan' },
    { playerId: 'tm-2004', name: '叶知秋', phone: '13800002004', gender: 'female', pinyin: 'yezhiqiu' },
    { playerId: 'tm-2005', name: '方正', phone: '13800002005', gender: 'male', pinyin: 'fangzheng' },
    { playerId: 'tm-2006', name: '蒋南', phone: '13800002006', gender: 'male', pinyin: 'jiangnan' }
  ],
  '3': [
    { playerId: 'tm-3001', name: '唐伟', phone: '13800003001', gender: 'male', pinyin: 'tangwei' },
    { playerId: 'tm-3002', name: '许佳', phone: '13800003002', gender: 'female', pinyin: 'xujia' },
    { playerId: 'tm-3003', name: '冯博', phone: '13800003003', gender: 'male', pinyin: 'fengbo' },
    { playerId: 'tm-3004', name: '程思远', phone: '13800003004', gender: 'male', pinyin: 'chengsiyuan' },
    { playerId: 'tm-3005', name: '潘悦', phone: '13800003005', gender: 'female', pinyin: 'panyue' }
  ]
};

function buildListMeta(team) {
  const parts = [];
  if (team.isMine) parts.push('我的球队');
  if (team.region) parts.push(team.region);
  if (team.memberCount) parts.push(team.memberCount + '人');
  return parts.join(' · ');
}

function allTeams() {
  return createdTeams.concat(TEAMS);
}

function resolveLogo(team) {
  if (team.logo) return team.logo;
  return mockAvatars.pickMockAvatar(team.name);
}

function getTeamById(id) {
  const team = allTeams().find((t) => t.id === String(id));
  if (!team) return null;
  return Object.assign({}, team, {
    logo: resolveLogo(team)
  });
}

/** 选择列表专用：仅球队信息，不含用户身份 role */
function listTeamsForSelect(searchTerm) {
  const term = String(searchTerm || '').trim().toLowerCase();
  return allTeams()
    .filter((team) => !term || team.name.toLowerCase().includes(term))
    .map((team) => ({
      id: team.id,
      name: team.name,
      logo: resolveLogo(team),
      metaText: buildListMeta(team),
      selected: false
    }));
}

/**
 * TODO：创建球队接口 — 当前为前端 mock，创建成功后插入列表顶部
 * TODO：创建成功后同步刷新球队列表
 */
function addCreatedTeam(payload) {
  const name = String((payload && payload.name) || '').trim();
  if (!name) return null;

  const team = {
    id: String((payload && payload.id) || Date.now()),
    name,
    role: (payload && payload.role) || '超级管理员',
    region: (payload && payload.region) || '',
    memberCount: (payload && payload.memberCount) || 1,
    isMine: true,
    logo: (payload && payload.logo) || '',
    slogan: (payload && payload.slogan) || '',
    desc: (payload && payload.desc) || ''
  };

  createdTeams.unshift(team);
  return Object.assign({}, team, { logo: resolveLogo(team) });
}

/**
 * Patch 7：按 teamId 返回 mock 球队成员（稳定 id）
 * @param {string} teamId
 * @returns {Array<{playerId,userId,name,competitionName,avatar,phone,gender,teamId,source,pinyin}>}
 */
function getTeamMembers(teamId) {
  const id = String(teamId || '').trim();
  if (!id) return [];
  const raw = TEAM_MEMBERS_BY_TEAM_ID[id];
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map((m, index) => {
    const playerId = String(m.playerId || '').trim();
    const name = String(m.name || '').trim();
    return {
      playerId: playerId,
      userId: playerId,
      name: name,
      competitionName: name,
      avatar: mockAvatars.pickMockAvatar(playerId || name || index),
      phone: m.phone != null ? String(m.phone) : '',
      gender: m.gender != null ? String(m.gender) : '',
      pinyin: m.pinyin != null ? String(m.pinyin) : name,
      teamId: id,
      source: 'team_member',
      pickChannel: 'team_members'
    };
  });
}

module.exports = {
  TEAMS,
  getTeamById,
  listTeamsForSelect,
  addCreatedTeam,
  getTeamMembers
};
