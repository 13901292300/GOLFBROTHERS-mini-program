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

module.exports = {
  TEAMS,
  getTeamById,
  listTeamsForSelect,
  addCreatedTeam
};
