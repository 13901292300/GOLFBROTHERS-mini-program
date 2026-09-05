/**
 * 「我的球队」第一版：路由、角色/标签分离、mock 集中、页面无散落数据。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/myTeams.selftest.js
 */

global.__TEAM_CLUB_REPO_MODE = 'local';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var passed = 0;
var failed = 0;

function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  console.log('FAIL  ' + label);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function exists(file) {
  return fs.existsSync(file);
}

function pageFiles(dir) {
  return ['js', 'wxml', 'wxss', 'json'].every(function (ext) {
    return exists(path.join(dir, 'index.' + ext));
  });
}

// 最小 wx 桩：只覆盖本测试会用到的本地存储接口，供身份认证相关断言使用
var __wxStorage = {};
global.wx = {
  getStorageSync: function (key) {
    return __wxStorage[key];
  },
  setStorageSync: function (key, value) {
    __wxStorage[key] = value;
  },
  removeStorageSync: function (key) {
    delete __wxStorage[key];
  },
  getSystemInfoSync: function () {
    return { SDKVersion: '3.0.0', statusBarHeight: 20, windowWidth: 375 };
  }
};

var listDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams');
var createDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'teams', 'create');
var detailDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-detail');
var introDir = path.join(detailDir, 'components', 'team-intro');
var membersDir = path.join(detailDir, 'components', 'team-members');
var matchesDir = path.join(detailDir, 'components', 'team-matches');
var stateDir = path.join(mini, 'subpackages', 'player', 'components', 'team-page-state');
var rolesPath = path.join(mini, 'utils', 'teamClub', 'roles.js');
var mockPath = path.join(mini, 'utils', 'teamClub', 'mock.js');
var servicePath = path.join(mini, 'utils', 'teamClub', 'service.js');

assert('列表页四文件存在', pageFiles(listDir));
assert('创建页四文件存在', pageFiles(createDir));
assert('详情页四文件存在', pageFiles(detailDir));
assert('简介/成员/比赛组件存在', pageFiles(introDir) && pageFiles(membersDir) && pageFiles(matchesDir));
var inviteDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-invite');
var manageSelectDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-manage', 'select');
var manageInviteDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-manage', 'invite');
var applicationDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-application');
assert('邀请页四文件存在', pageFiles(inviteDir));
assert('管理选人/邀请页存在', pageFiles(manageSelectDir) && pageFiles(manageInviteDir));
assert('入队申请详情页存在', pageFiles(applicationDir));
assert('球队详情内不再挂申请列表页', !pageFiles(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-manage', 'applications')));
assert('roles/mock/service 存在', exists(rolesPath) && exists(mockPath) && exists(servicePath));
assert('球队通知跳转模块存在', exists(path.join(mini, 'utils', 'teamClub', 'notices.js')));

var app = JSON.parse(read(path.join(mini, 'app.json')));
var player = (app.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/player';
});
assert(
  'player 分包注册球队相关页',
  !!player &&
    player.pages.indexOf('pages/me/teams/index') >= 0 &&
    player.pages.indexOf('pages/me/teams/create/index') >= 0 &&
    player.pages.indexOf('pages/me/team-detail/index') >= 0 &&
    player.pages.indexOf('pages/me/team-invite/index') >= 0 &&
    player.pages.indexOf('pages/me/team-manage/select/index') >= 0 &&
    player.pages.indexOf('pages/me/team-manage/invite/index') >= 0 &&
    player.pages.indexOf('pages/me/team-application/index') >= 0 &&
    player.pages.indexOf('pages/me/team-edit/index') >= 0 &&
    player.pages.indexOf('pages/me/team-notices/index') >= 0 &&
    player.pages.indexOf('pages/me/team-applications/index') >= 0 &&
    player.pages.indexOf('pages/me/team-manage/applications/index') < 0
);

var homeJs = read(path.join(mini, 'pages', 'home', 'index.js'));
var homeWxml = read(path.join(mini, 'pages', 'home', 'index.wxml'));
assert(
  '首页「我的球队」入口走新路由',
  homeJs.indexOf("url: '/subpackages/player/pages/me/teams/index'") >= 0 &&
    homeWxml.indexOf('navigateToMyTeams') >= 0
);

var listJs = read(path.join(listDir, 'index.js'));
var detailJs = read(path.join(detailDir, 'index.js'));
var createJs = read(path.join(createDir, 'index.js'));
var introJs = read(path.join(introDir, 'index.js'));
var membersJs = read(path.join(membersDir, 'index.js'));
var membersWxml = read(path.join(membersDir, 'index.wxml'));
var matchesJs = read(path.join(matchesDir, 'index.js'));
var introWxml = read(path.join(introDir, 'index.wxml'));
var inviteJs = read(path.join(inviteDir, 'index.js'));
var inviteWxml = read(path.join(inviteDir, 'index.wxml'));
var manageSelectJs = read(path.join(manageSelectDir, 'index.js'));
var manageInviteJs = read(path.join(manageInviteDir, 'index.js'));
var applicationJs = read(path.join(applicationDir, 'index.js'));
var applicationWxml = read(path.join(applicationDir, 'index.wxml'));
var pageBundle = [listJs, detailJs, createJs, introJs, membersJs, membersWxml, matchesJs, inviteJs, inviteWxml, manageSelectJs, manageInviteJs, applicationJs, applicationWxml].join('\n');

assert(
  '页面组件不含 MOCK_TEAMS / 散落球队 mock',
  pageBundle.indexOf('MOCK_TEAMS') < 0 &&
    pageBundle.indexOf('MOCK_MEMBERS') < 0 &&
    pageBundle.indexOf('北京湘鹰高尔夫俱乐部') < 0 &&
    pageBundle.indexOf('matchCount') < 0 &&
    pageBundle.indexOf('比赛场次') < 0
);

assert(
  '详情页拆分为三个独立组件',
  detailJs.indexOf('球队简介展示') < 0 &&
    read(path.join(detailDir, 'index.json')).indexOf('team-intro') >= 0 &&
    read(path.join(detailDir, 'index.json')).indexOf('team-members') >= 0 &&
    read(path.join(detailDir, 'index.json')).indexOf('team-matches') >= 0 &&
    read(path.join(detailDir, 'index.wxml')).indexOf('<team-intro') >= 0
);

assert(
  '列表/详情走 service 适配层',
  listJs.indexOf('utils/teamClub/service.js') >= 0 &&
    detailJs.indexOf('utils/teamClub/service.js') >= 0
);

var serviceJs = read(servicePath);
assert(
  'service 已去掉 TODO API 占位，走统一仓储',
  serviceJs.indexOf('TODO: GET /api') < 0 &&
    serviceJs.indexOf("require('./mock.js')") < 0 &&
    serviceJs.indexOf('repoFactory.js') >= 0
);

assert(
  '发起比赛携带 teamId 且复用队内赛创建页',
  serviceJs.indexOf('/subpackages/create/pages/team-internal/index') >= 0 &&
    serviceJs.indexOf('teamId=') >= 0
);

var internalJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'team-internal', 'index.js'));
assert(
  '队内赛创建页仅预填 teamId，且俱乐部球队只读统一仓储',
  internalJs.indexOf('_prefillTeamFromQuery') >= 0 &&
    internalJs.indexOf('_applySelectedTeam') >= 0 &&
    internalJs.indexOf('teamClub/access.js') >= 0 &&
    internalJs.indexOf('peekTeam') >= 0
);

JSON.parse(read(path.join(listDir, 'index.json')));
JSON.parse(read(path.join(createDir, 'index.json')));
JSON.parse(read(path.join(detailDir, 'index.json')));
JSON.parse(read(path.join(inviteDir, 'index.json')));
JSON.parse(read(path.join(manageSelectDir, 'index.json')));
JSON.parse(read(path.join(manageInviteDir, 'index.json')));
JSON.parse(read(path.join(applicationDir, 'index.json')));
assert('页面 JSON 可解析', true);

var roles = require(rolesPath);
var mock = require(mockPath);
var service = require(servicePath);

var detailWxmlSrc = read(path.join(detailDir, 'index.wxml'));
var detailWxssSrc = read(path.join(detailDir, 'index.wxss'));
assert(
  'Tab 三项共用 onTabChange 且 data-tab 不与 wx:key 冲突',
  detailWxmlSrc.indexOf('bindtap="onTabChange"') >= 0 &&
    detailWxmlSrc.indexOf('data-tab="{{item.key}}"') >= 0 &&
    detailWxmlSrc.indexOf('data-key="{{item.key}}"\n      bindtap="onTabChange"') < 0 &&
    detailJs.indexOf('onTabChange(e)') >= 0 &&
    detailJs.indexOf('e.currentTarget.dataset') >= 0 &&
    detailJs.indexOf('onSwitchTab') < 0
);
assert(
  'Tab 内容分支与 key 命名一致（intro/members/matches）',
  detailWxmlSrc.indexOf("activeTab === 'intro'") >= 0 &&
    detailWxmlSrc.indexOf("activeTab === 'members'") >= 0 &&
    detailWxmlSrc.indexOf("activeTab === 'matches'") >= 0 &&
    detailWxmlSrc.indexOf("activeTab !== 'members'") < 0 &&
    detailJs.indexOf("activeTab: 'intro'") >= 0
);
assert(
  'Tab 容器有层级、装饰层不吃点击、切换不看权限',
  detailWxssSrc.indexOf('.td-tabs') >= 0 &&
    /\.td-tabs\s*\{[^}]*z-index:\s*2/.test(detailWxssSrc) &&
    /\.td-tab__label\s*\{[^}]*pointer-events:\s*none/.test(detailWxssSrc) &&
    detailJs.indexOf('onTabChange(e)') >= 0 &&
    detailJs
      .slice(detailJs.indexOf('onTabChange(e)'), detailJs.indexOf('onRetryIntro'))
      .indexOf('permissions') < 0
);

// 渲染层自触发环防回归：成员组件 observer 监听的字段，不能出现在 _rebuild 写回的数据里
var membersCompJs = read(path.join(detailDir, 'components', 'team-members', 'index.js'));
var observedFields = (membersCompJs.match(/'([^']*)':\s*function\s*\(\)\s*\{\s*this\._rebuild/) || [
  '',
  ''
])[1]
  .split(',')
  .map(function (s) {
    return s.trim();
  })
  .filter(Boolean);
var memberListView = require(path.join(mini, 'utils', 'teamClub', 'memberListView.js'));
var rebuiltKeys = Object.keys(
  memberListView.buildMemberListView([{ displayName: '张三', sortPinyin: 'zhangsan', letter: 'Z' }], '')
);
assert(
  '成员组件 observer 与 _rebuild 写回字段无交集（无 setData 自触发环）',
  observedFields.length > 0 &&
    observedFields.indexOf('showManageButton') < 0 &&
    rebuiltKeys.indexOf('showManageButton') < 0 &&
    observedFields.every(function (f) {
      return rebuiltKeys.indexOf(f) < 0;
    })
);

var permSrc = roles.derivePermissions.toString();
assert(
  'derivePermissions 不读取 captain / tags',
  permSrc.indexOf('captain') < 0 && permSrc.indexOf('tags') < 0 && permSrc.indexOf('isCaptain') < 0
);

assert(
  '队长只是标签',
  roles.isCaptain({ role: 'member', tags: ['captain'] }) === true &&
    roles.isCaptain({ role: 'super_admin', tags: [] }) === false &&
    roles.normalizeRole('owner') === 'super_admin'
);

var memberPerm = roles.derivePermissions('member');
var adminPerm = roles.derivePermissions('admin');
var superPerm = roles.derivePermissions('super_admin');
assert(
  '成员无管理权限、管理员可发起比赛但不能改管理员/队长、超管可转让',
  memberPerm.canCreateTeamMatch === false &&
    memberPerm.canManageAdmins === false &&
    memberPerm.canShareTeam === true &&
    roles.canOpenMemberManageMenu(memberPerm) === false &&
    adminPerm.canCreateTeamMatch === true &&
    adminPerm.canInviteMember === true &&
    adminPerm.canReviewJoinRequests === true &&
    roles.derivePermissions('admin', { grants: ['team_application.review'] }).canReviewJoinRequests === true &&
    roles.canReviewTeamApplication('member', ['team_application.review']) === false &&
    roles.canReviewTeamApplication('super_admin', []) === true &&
    adminPerm.canRemoveOrdinaryMember === true &&
    adminPerm.canSetCaptain === false &&
    adminPerm.canTransferSuperAdmin === false &&
    adminPerm.canManageAdmins === false &&
    superPerm.canTransferSuperAdmin === true &&
    superPerm.canManageAdmins === true &&
    superPerm.canSetCaptain === true &&
    superPerm.canRemoveMember === true &&
    superPerm.canShareTeam === true &&
    roles.canOpenMemberManageMenu(adminPerm) === true &&
    roles.canOpenMemberManageMenu(superPerm) === true
);

var transferMembers = [
  { userId: 'a', role: 'super_admin', tags: ['captain'], status: 'active' },
  { userId: 'b', role: 'member', tags: [], status: 'active' }
];
var transferred = roles.transferSuperAdmin(transferMembers, 'a', 'b');
assert(
  '转让超管只改 role、保留双方队长标签',
  transferred.ok &&
    transferred.members[0].role === 'admin' &&
    transferred.members[1].role === 'super_admin' &&
    transferred.members[0].tags.indexOf('captain') >= 0 &&
    transferred.members[1].tags.indexOf('captain') < 0
);

var assigned = roles.assignCaptain(transferMembers, 'b');
assert(
  '更换队长时原队长标签取消且不改 role',
  assigned.ok &&
    assigned.members[0].role === 'super_admin' &&
    assigned.members[1].role === 'member' &&
    assigned.members[0].tags.indexOf('captain') < 0 &&
    assigned.members[1].tags.indexOf('captain') >= 0
);

assert('生产 mock.js 已停用', !mock.MOCK_TEAMS && Object.keys(mock).length === 0);

var identity = require(path.join(mini, 'utils', 'teamClub', 'identity.js'));
var repo = require(path.join(mini, 'utils', 'teamClub', 'repository.js'));
repo.resetForTests();
identity.setTestSession({ userId: 'user_owner', displayName: '唐伟' });

var teamA = repo.createTeam({
  name: '页面测试甲队',
  shortName: '甲队',
  city: '北京',
  slogan: '下场就现在',
  intro: '简介正文',
  acceptingMembers: true
});
var teamB = repo.createTeam({ name: '页面测试乙队', city: '上海', acceptingMembers: true });
var teamC = repo.createTeam({ name: '空态队', city: '杭州', acceptingMembers: true });
assert('本地仓储可创建球队', teamA.ok && teamB.ok && teamC.ok);
var idA = teamA.data.teamId;
var idB = teamB.data.teamId;
var idC = teamC.data.teamId;

repo.addMember(idA, 'user_member', { displayName: 'Ken' });
repo.addMember(idA, 'user_admin', { displayName: '管理' });
repo.setAdmin(idA, 'user_admin', true);
repo.addMember(idB, 'user_member', { displayName: 'Ken' });
identity.setTestSession({ userId: 'user_owner', displayName: '唐伟' });
repo.setCaptain(idC, 'user_owner');

var putA = repo.putMatch({
  teamId: idA,
  matchId: 'gm_page_1',
  match: {
    matchId: 'gm_page_1',
    teamId: idA,
    matchType: 'team-internal',
    roundName: '甲队队内赛',
    teeTime: '2026-09-06',
    courseName: '测试球场'
  }
});
assert('页面测试写入比赛正文', putA.ok && putA.data.matchId === 'gm_page_1');

service.listMyTeams({ immediate: true }).then(function (res) {
  assert('listMyTeams 仓储成功', res.ok && res.list.length >= 3);
  var tA = res.list.filter(function (t) { return t.id === idA; })[0];
  var tC = res.list.filter(function (t) { return t.id === idC; })[0];
  assert(
    '列表项含 LOGO/全称/地区/人数/徽章',
    tA && tA.logo && tA.fullName && tA.regionText && tA.memberCount > 0 && tA.badges && tA.badges.length >= 1
  );
  assert(
    '超管列表项可发起比赛',
    tA && tA.permissions.canCreateTeamMatch === true
  );
  assert(
    '队长标签不授予发起比赛权限',
    tC && tC.permissions.canCreateTeamMatch === true
      ? tC.currentUserRole === 'super_admin'
      : tC.permissions.canCreateTeamMatch === false
  );
  return service.getTeamDetail(idA, { immediate: true });
}).then(function (detail) {
  assert(
    '详情含简介字段',
    detail.ok &&
      (detail.team.slogan || detail.team.description) &&
      detail.team.regionText
  );
  return service.listTeamMembers(idA, { immediate: true });
}).then(function (members) {
  assert('成员列表可搜索数据源就绪', members.ok && members.list.length >= 2);
  assert(
    '成员展示模型不含 matchCount',
    members.list.every(function (m) {
      return !Object.prototype.hasOwnProperty.call(m, 'matchCount') &&
        !Object.prototype.hasOwnProperty.call(m, 'matchCountText');
    })
  );
  var filtered = service.filterMembersLocal(members.list, 'Ken');
  assert('成员搜索支持姓名或昵称', filtered.length === 1 && filtered[0].userId === 'user_member');
  var nameHit = service.filterMembersLocal(members.list, '唐伟');
  assert('成员搜索命中姓名', nameHit.length >= 1);
  var manageOnCaptainMember = roles.buildMemberManageActions(
    roles.derivePermissions('member'),
    'other-user',
    { userId: 'user_owner', role: 'member', tags: ['captain'], status: 'active' }
  );
  assert('队长标签不产生管理菜单', manageOnCaptainMember.length === 0);
  var superMenu = roles.buildManageMenuItems(roles.derivePermissions('super_admin'));
  var adminMenu = roles.buildManageMenuItems(roles.derivePermissions('admin'));
  var memberMenu = roles.buildManageMenuItems(roles.derivePermissions('member'));
  assert(
    '管理菜单超管含管理员/队长/转让',
    superMenu.some(function (a) { return a.key === 'unset_admin'; }) &&
      superMenu.some(function (a) { return a.key === 'set_captain'; }) &&
      superMenu.some(function (a) { return a.key === 'transfer_super'; }) &&
      adminMenu.some(function (a) { return a.key === 'invite_member'; }) &&
      adminMenu.some(function (a) { return a.key === 'remove'; }) &&
      memberMenu.length === 0 &&
      membersWxml.indexOf('pendingCount') < 0
  );
  assert(
    '成员行始终进主页，管理入口在标题行',
    membersJs.indexOf('openPlayerProfile') >= 0 &&
      membersWxml.indexOf('bindtap="onTapManage"') >= 0 &&
      membersWxml.indexOf('球队成员') >= 0
  );
  assert(
    '简介头部复用原生分享且邀请页只展示公开资料',
    introWxml.indexOf('open-type="share"') >= 0 &&
      service.buildTeamInviteUrl(idA).indexOf('teamId=') >= 0 &&
      inviteWxml.indexOf('joinView.ctaLabel') >= 0 &&
      inviteWxml.indexOf('<team-members') < 0 &&
      inviteWxml.indexOf('<team-matches') < 0
  );
  return service.listTeamMatches(idA, { immediate: true });
}).then(function (matches) {
  assert('球队比赛列表仅队内赛且可打开', matches.ok && matches.list.length >= 1 && matches.list[0].canOpen === true && matches.list[0].matchId === 'gm_page_1' && String(matches.list[0].matchType || 'team-internal') === 'team-internal');
  return service.listTeamMatches(idC, { immediate: true });
}).then(function (emptyMatches) {
  assert('空态队比赛为空', emptyMatches.ok && emptyMatches.list.length === 0);
  assert(
    '创建比赛 URL 携带 teamId',
    service.buildCreateTeamMatchUrl(idA).indexOf('teamId=') >= 0
  );
  return service.listMyTeams({ immediate: true });
}).then(function (mine) {
  assert(
    '当前用户只看到已加入球队',
    mine.ok &&
      mine.list.some(function (t) { return t.id === idA; }) &&
      !mine.list.some(function (t) { return t.id === '4' || t.id === '5'; })
  );
  return service.getMemberManageMenu(idA, { immediate: true });
}).then(function (menu) {
  assert(
    '超管显示管理按钮',
    menu.ok && menu.showManageButton === true &&
      menu.items.some(function (i) { return i.key === 'invite_member'; })
  );
  identity.setTestSession({ userId: 'user_member', displayName: 'Ken' });
  return service.getMemberManageMenu(idC, { immediate: true });
}).then(function (memberMenuRes) {
  assert('非成员/普通成员管理按钮受限', memberMenuRes.ok && memberMenuRes.showManageButton === false);
  identity.setTestSession({ userId: 'user_owner', displayName: '唐伟' });
  return service.listMembersForManageAction(idA, 'set_admin', { immediate: true });
}).then(function (setAdminList) {
  assert(
    '设置管理员只列出普通成员',
    setAdminList.ok &&
      setAdminList.list.length > 0 &&
      setAdminList.list.every(function (m) { return m.role === 'member' && m.userId !== 'user_owner'; })
  );
  identity.setTestSession({ userId: 'user_admin', displayName: '管理' });
  return service.listMembersForManageAction(idA, 'remove', { immediate: true });
}).then(function (adminRemove) {
  assert(
    '管理员移出只能选普通成员',
    adminRemove.ok &&
      adminRemove.list.every(function (m) { return m.role === 'member'; })
  );
  identity.setTestSession({ userId: 'user_admin', displayName: '管理' });
  return service.applyMemberAction(idA, 'set_admin', 'user_member');
}).then(function (adminCannotSet) {
  assert('管理员不能设置管理员', !adminCannotSet.ok);
  identity.setTestSession({ userId: 'user_member', displayName: 'Ken' });
  return service.getTeamInvitePage(idA, { immediate: true });
}).then(function (inviteMember) {
  assert(
    '已加入成员邀请页进入球队',
    inviteMember.ok &&
      inviteMember.joinView.ctaAction === 'enter' &&
      !inviteMember.team.members
  );
  identity.setTestSession({ userId: 'user_outsider', displayName: '外人' });
  return service.getTeamInvitePage(idA, { immediate: true });
}).then(function (inviteApply) {
  assert(
    '未加入且开放申请显示申请加入',
    inviteApply.ok &&
      inviteApply.joinView.ctaAction === 'apply'
  );
  return service.applyToJoinTeam(idA, { immediate: true });
}).then(function (applied) {
  assert('提交申请后状态为已提交', applied.ok && (applied.joinView.ctaKey === 'pending' || applied.joinView.ctaAction === 'pending' || applied.joinView.ctaDisabled));
  return service.applyToJoinTeam(idA, { immediate: true });
}).then(function (dupApp) {
  assert('同一账号同一球队只允许一条待处理申请', !dupApp.ok && (dupApp.reason === 'already_pending' || dupApp.code === 'already_pending'));
  identity.setTestSession({ userId: 'user_member', displayName: 'Ken' });
  return service.applyToJoinTeam(idA, { immediate: true });
}).then(function (already) {
  assert('已是成员不能重复申请', !already.ok && (already.reason === 'already_member' || already.code === 'already_member'));
  identity.setTestSession({ userId: 'user_outsider', displayName: '外人' });
  return service.getTeamInvitePage('no-such-team', { immediate: true });
}).then(function (missing) {
  assert('球队不存在时返回 not_found', !missing.ok && (missing.reason === 'not_found' || missing.code === 'not_found'));
  var share = service.buildTeamShareMessage({ id: idA, fullName: '页面测试甲队' });
  assert(
    '分享路径携带 teamId',
    share.path.indexOf('/subpackages/player/pages/me/team-invite/index') >= 0 &&
      share.path.indexOf('teamId=') >= 0
  );

  var manageDir = path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-manage');
  var selectSrc = read(path.join(manageDir, 'select', 'index.js'));
  var inviteSrc = read(path.join(manageDir, 'invite', 'index.js'));
  assert('选人页防重复提交', selectSrc.indexOf('submitting: true') > 0);
  assert('转让超管二次确认', selectSrc.indexOf('再次确认转让') > 0);
  var tapBody = selectSrc.slice(selectSrc.indexOf('onTapMember(e)'), selectSrc.indexOf('onConfirm()'));
  assert('点行只做单选不直接执行', tapBody.indexOf('applyMemberAction') < 0 && tapBody.indexOf('showModal') < 0);
  assert('点行写入选中态', tapBody.indexOf('selectedUserId') > 0);
  assert('确认按钮存在且校验选中', /onConfirm\(\)/.test(selectSrc) && selectSrc.indexOf('请先选择一名成员') > 0);
  assert('选人页关闭 enhanced 滚动', selectSrc.indexOf('enhanced') < 0);
  assert('选人页成功后定向刷新上一页', selectSrc.indexOf('refreshAfterMemberAction') > 0 && inviteSrc.indexOf('refreshAfterMemberAction') > 0);
  assert('添加成员页防重复提交', inviteSrc.indexOf('self._submitting = true') > 0);

  var allRoutes = (app.pages || []).map(function (p) { return '/' + p; });
  (app.subPackages || []).forEach(function (sub) {
    (sub.pages || []).forEach(function (p) {
      allRoutes.push('/' + sub.root + '/' + p);
    });
  });
  var detailUrl = service.buildMatchDetailUrl('gm_page_1');
  var createUrl = service.buildCreateTeamMatchUrl(idA);
  assert(
    '比赛详情走已注册路由且参数名为 matchId',
    allRoutes.indexOf(detailUrl.split('?')[0]) >= 0 && detailUrl.indexOf('?matchId=') > 0
  );
  assert(
    '创建队内赛走已注册路由并携带 teamId',
    allRoutes.indexOf(createUrl.split('?')[0]) >= 0 && createUrl.indexOf('?teamId=') > 0
  );
  assert('无比赛标识时不拼详情 URL', service.buildMatchDetailUrl('') === '');

  var createSrc = read(path.join(mini, 'subpackages', 'create', 'pages', 'team-internal', 'index.js'));
  assert('创建页读取 teamId 并预填球队', createSrc.indexOf('options.teamId') > 0 && createSrc.indexOf('_prefillTeamFromQuery') > 0);
  assert('创建以云端正文成功为准', createSrc.indexOf('putMatch') > 0 && createSrc.indexOf('创建未成功') > 0);
  var matchDetailSrc = read(path.join(mini, 'subpackages', 'tournament', 'pages', 'detail', 'index.js'));
  assert('比赛详情页读取 matchId 并拉云端正文', matchDetailSrc.indexOf('options.matchId') > 0 && matchDetailSrc.indexOf('_pullCloudMatch') > 0);

  var matchesCompJs = read(path.join(detailDir, 'components', 'team-matches', 'index.js'));
  var matchesCompWxml = read(path.join(detailDir, 'components', 'team-matches', 'index.wxml'));
  assert('比赛卡片事件带 canOpen', matchesCompJs.indexOf('canOpen') > 0);
  assert('比赛空态/错误态文案存在', matchesCompWxml.indexOf('暂无球队比赛') > 0 && matchesCompWxml.indexOf('无法获取球队比赛') > 0 && matchesCompWxml.indexOf('目前仅同步队内赛') > 0);
  assert('创建入口仍只看 canCreateTeamMatch', matchesCompWxml.indexOf('wx:if="{{canCreateTeamMatch}}"') > 0);

  var openBody = detailJs.slice(detailJs.indexOf('onOpenMatch(e)'));
  var createBody = detailJs.slice(detailJs.indexOf('onCreateMatch()'), detailJs.indexOf('onOpenMatch(e)'));
  assert('比赛跳转失败有提示', openBody.indexOf('比赛详情跳转失败') > 0 && openBody.indexOf('缺少有效标识') > 0);
  assert('创建入口点击时再校验权限', createBody.indexOf('canCreateTeamMatch') > 0 && createBody.indexOf('没有发起球队比赛的权限') > 0);
  assert('创建页跳转失败有提示', createBody.indexOf('创建页跳转失败') > 0);
  assert('详情页无 DIAG 提前结束开关', detailJs.indexOf('DIAG_NO_AUTO_REFRESH') < 0 && detailJs.indexOf('DIAG_ISOLATE_MATCH') < 0);

  assert(
    '分享卡片指向邀请页并携带 teamId',
    share.path.indexOf('/team-invite/index') > 0 && share.path.indexOf('teamId=') > 0
  );
  assert('无分享权限或资料未就绪时不分享', detailJs.indexOf('canShareTeam') > 0);

  var inviteJsSrc = read(path.join(mini, 'subpackages', 'player', 'pages', 'me', 'team-invite', 'index.js'));
  assert('邀请页防重复提交', inviteJsSrc.indexOf('submitting: true') > 0);
  assert('邀请页球队不存在时给失效提示', inviteJsSrc.indexOf('球队不存在') > 0 || inviteJsSrc.indexOf('not_found') > 0);
  assert('邀请页拒绝分支有原因提示', inviteJsSrc.indexOf('already_pending') > 0);

  assert(
    '普通成员可以分享球队',
    roles.derivePermissions('member', { isMember: true }).canShareTeam === true
  );
  assert(
    '普通成员不获得管理或创建比赛权限',
    (function () {
      var p = roles.derivePermissions('member', { isMember: true });
      return !p.canCreateTeamMatch && !p.canInviteMember && !p.canManageAdmins;
    })()
  );
  assert('非成员没有分享权限', !roles.derivePermissions('member', { isMember: false }).canShareTeam);

  var devFlags = require(path.join(mini, 'utils', 'teamClub', 'devFlags.js'));
  assert('诊断工具默认关闭', devFlags.SHOW_DIAG_TOOLS === false);
  assert('生产不启用本地仓储开关', devFlags.USE_LOCAL_REPOSITORY === false);

  identity.setTestSession({ userId: 'user_owner', displayName: '唐伟' });
  var removed = service.applyMemberAction(idA, 'remove', 'user_member');
  return Promise.resolve(removed);
}).then(function (removed) {
  assert('移出成员后仓储更新', removed && removed.then ? true : removed.ok);
  return removed && removed.then ? removed : Promise.resolve(removed);
}).then(function (removedRes) {
  assert('移出成员成功', removedRes.ok);
  var qrAuth = require(path.join(mini, 'utils', 'qrAccessAuth.js'));
  assert('默认账号视为已认证', qrAuth.isRegistered({ userId: 'user_owner' }) === true);
  __wxStorage[qrAuth.AUTH_STORAGE_KEY] = { registered: false };
  assert('未认证时 isRegistered 为 false', qrAuth.isRegistered({ userId: 'user_owner' }) === false);
  delete __wxStorage[qrAuth.AUTH_STORAGE_KEY];

  identity.clearSession();
  return service.applyToJoinTeam(idA, { immediate: true });
}).then(function (r8) {
  assert('无有效身份时不创建申请', !r8.ok && (r8.reason === 'need_login' || r8.code === 'need_login'));
  var deadIfFalse = ['if (', 'false) {'].join('');
  assert('测试源无死 mock 套件', fs.readFileSync(__filename, 'utf8').indexOf(deadIfFalse) < 0);
  console.log('\npassed=' + passed + ' failed=' + failed + ' skipped=0');
  if (failed) process.exit(1);
}).catch(function (err) {
  failed += 1;
  console.log('FAIL  async adapter', err && err.message);
  console.log(err && err.stack);
  console.log('\npassed=' + passed + ' failed=' + failed + ' skipped=0');
  process.exit(1);
});

