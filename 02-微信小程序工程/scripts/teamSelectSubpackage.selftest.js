/**
 * team/select 迁入 create 分包：页面完整性、路由、eventChannel 与球队云仓储契约。
 *
 * 运行（在 02-微信小程序工程 目录）：
 *   node scripts/teamSelectSubpackage.selftest.js
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var mini = path.join(root, 'miniprogram');
var newPageDir = path.join(mini, 'subpackages', 'create', 'pages', 'team', 'select');
var oldPageDir = path.join(mini, 'pages', 'team', 'select');
var targetUrl = '/subpackages/create/pages/team/select/index';
var oldUrl = '/pages/team/select/index';
var passed = 0;
var failed = 0;
var failures = [];

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + label);
    return;
  }
  failed += 1;
  failures.push(label);
  console.log('FAIL  ' + label);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

var extensions = ['js', 'wxml', 'wxss', 'json'];
assert(
  '新页面四文件存在',
  extensions.every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  })
);

var appJson = JSON.parse(read(path.join(mini, 'app.json')));
var createPackage = (appJson.subPackages || []).find(function (item) {
  return item && item.root === 'subpackages/create';
});
assert(
  'create 分包注册新页面',
  !!createPackage && createPackage.pages.indexOf('pages/team/select/index') >= 0
);
assert('主包旧声明已移除', appJson.pages.indexOf('pages/team/select/index') < 0);
assert('旧物理页面目录不存在', !fs.existsSync(oldPageDir));

var teamInternalJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'team-internal', 'index.js'));
var teamInterJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'team-inter', 'index.js'));
var seriesJs = read(path.join(mini, 'subpackages', 'create', 'pages', 'series', 'index.js'));
var entrySources = teamInternalJs + '\n' + teamInterJs + '\n' + seriesJs;
var targetHits = entrySources.split(targetUrl).length - 1;
assert('六类生产入口全部指向新路由', targetHits === 6);
assert(
  '旧生产路由搜索为 0',
  !new RegExp("['\"]" + oldUrl.replace(/\//g, '\\/')).test(entrySources)
);
assert(
  'selectedId query 保留',
  teamInternalJs.indexOf(targetUrl + "?selectedId=' + (this.data.teamId || '')") >= 0 &&
    seriesJs.indexOf(targetUrl + "?selectedId=' + encodeURIComponent(currentId || '')") >= 0
);
assert(
  'event_org query 保留',
  teamInterJs.indexOf(targetUrl + '?mode=event_org') >= 0 &&
    seriesJs.indexOf(targetUrl + '?mode=event_org') >= 0
);
assert(
  'inter_team_participants query 保留',
  teamInterJs.indexOf(targetUrl + '?mode=inter_team_participants') >= 0 &&
    seriesJs.indexOf(targetUrl + '?mode=inter_team_participants') >= 0
);
assert(
  '动态 query 与编码保持',
  teamInterJs.indexOf("url += '&maxCount=2'") >= 0 &&
    seriesJs.indexOf("encodeURIComponent(currentId || '')") >= 0
);

var newJsPath = path.join(newPageDir, 'index.js');
var newJs = read(newJsPath);
['teamSelected', 'participantsSelected', 'organizationSelected'].forEach(function (eventName) {
  assert('保留输出 eventChannel：' + eventName, newJs.indexOf("channel.emit('" + eventName + "'") >= 0);
});
['initParticipants', 'initOrganization'].forEach(function (eventName) {
  assert('保留初始化 eventChannel：' + eventName, newJs.indexOf("channel.on('" + eventName + "'") >= 0);
});

var requiredFiles = [];
var requireSpecs = [];
newJs.replace(/require\(['"]([^'"]+)['"]\)/g, function (match, request) {
  requireSpecs.push(request.replace(/\\/g, '/'));
  requiredFiles.push(path.resolve(newPageDir, request));
  return match;
});
assert(
  '选球队页 require 均可解析',
  requiredFiles.length > 0 && requiredFiles.every(fs.existsSync)
);
assert(
  '使用正式 teamClub/service 云仓储路径',
  requireSpecs.some(function (r) {
    return /utils\/teamClub\/service(?:\.js)?$/.test(r);
  })
);

delete global.__TEAM_CLUB_REPO_MODE;
var factory = require(path.join(mini, 'utils', 'teamClub', 'repoFactory.js'));
var flags = require(path.join(mini, 'utils', 'teamClub', 'devFlags.js'));
assert(
  '生产默认云仓储且不回落 mock/local',
  factory.getMode() === 'cloud' &&
    flags.USE_LOCAL_REPOSITORY === false &&
    requireSpecs.indexOf('../../../../../utils/teamClub/repository.js') < 0 &&
    requireSpecs.indexOf('../../../../../utils/teamClub/mock.js') < 0 &&
    newJs.indexOf("require('./mock") < 0
);

var wxml = read(path.join(newPageDir, 'index.wxml'));
JSON.parse(read(path.join(newPageDir, 'index.json')));
assert('页面 JSON 可解析', true);
assert(
  '页面四件套与空态结构完整',
  ['js', 'wxml', 'wxss', 'json'].every(function (ext) {
    return fs.existsSync(path.join(newPageDir, 'index.' + ext));
  }) &&
    wxml.indexOf('showSearchCreateEmpty') >= 0 &&
    wxml.indexOf('showSearchUnavailable') >= 0 &&
    wxml.indexOf('team-empty') >= 0
);

var utilsRoot = path.join(mini, 'utils') + path.sep;
var createRoot = path.join(mini, 'subpackages', 'create') + path.sep;
var heavyRoots = [
  path.join(mini, 'subpackages', 'poster') + path.sep,
  path.join(mini, 'subpackages', 'game') + path.sep,
  path.join(mini, 'subpackages', 'tournament') + path.sep,
  path.join(mini, 'subpackages', 'tournament-manage') + path.sep,
  path.join(mini, 'subpackages', 'scoring') + path.sep,
  path.join(mini, 'subpackages', 'player', 'pages') + path.sep
];
var heavyHits = requiredFiles.filter(function (abs) {
  return heavyRoots.some(function (rootDir) {
    return abs.indexOf(rootDir) === 0;
  });
});
assert(
  '不依赖海报/游戏/赛事等大型无关分包',
  heavyHits.length === 0 &&
    requiredFiles.every(function (abs) {
      return abs.indexOf(utilsRoot) === 0 || abs.indexOf(createRoot) === 0;
    })
);
assert(
  '公开契约：列表刷新与确认入口仍存在',
  newJs.indexOf('refreshTeams') >= 0 && newJs.indexOf('onConfirm') >= 0
);
assert(
  '空态/加载态/错误态可处理',
  newJs.indexOf('showEmptyState') >= 0 &&
    newJs.indexOf('emptyVisible') >= 0 &&
    /createTeam\s*\(/.test(newJs) &&
    /\.then\s*\(/.test(newJs) &&
    newJs.indexOf("title: (res && res.message) || '创建失败'") >= 0
);
assert('未保留 redirect 兼容壳', !fs.existsSync(oldPageDir));

var createSelectSrc = read(path.join(mini, 'utils', 'teamClub', 'createTeamSelect.js'));
assert(
  '默认列表走 listTeamsForCreateDefault 而非 snapshot 全量 includes',
  newJs.indexOf('listTeamsForCreateDefault') >= 0 &&
    newJs.indexOf('_loadDefaultClubTeams') >= 0 &&
    newJs.indexOf('_searchGlobalTeams') >= 0 &&
    newJs.indexOf('searchTeamsForCreate') >= 0 &&
    newJs.indexOf('snapshot.listTeams') < 0 &&
    newJs.indexOf('listClubTeamsForSelect') < 0 &&
    createSelectSrc.indexOf('snapshot.listTeams') < 0 &&
    createSelectSrc.indexOf('.includes(') < 0
);
assert(
  'creator 复用 isCreatorOfMatch，不把 me 当云 userId',
  createSelectSrc.indexOf('isCreatorOfMatch') >= 0 &&
    createSelectSrc.indexOf("createdBy ===") < 0 &&
    !/['"]me['"]/.test(createSelectSrc)
);
assert(
  '冷启动 ensureCloudIdentity 后拉默认列表',
  newJs.indexOf('ensureCloudIdentity') >= 0 &&
    /ensureCloudIdentity\(\)[\s\S]*listTeamsForCreateDefault/.test(newJs)
);
var onShowBlock = (newJs.match(/onShow\(\)\s*\{[\s\S]*?\n  \},/) || [])[0] || '';
assert(
  'onShow 不重复 listMyTeams / listTeamsForCreateDefault',
  onShowBlock.indexOf('refreshTeams') >= 0 &&
    onShowBlock.indexOf('listTeamsForCreateDefault') < 0 &&
    onShowBlock.indexOf('listMyTeams') < 0
);
assert(
  'event_org 仍走机构目录',
  newJs.indexOf('listSelectableEventOrganizations') >= 0
);
assert('WXML 有 loading 态', wxml.indexOf('teamsLoading') >= 0);
assert(
  'service 导出默认列表与搜索预留',
  /listTeamsForCreateDefault\s*:/.test(read(path.join(mini, 'utils', 'teamClub', 'service.js'))) &&
    /searchTeamsForCreate\s*:/.test(read(path.join(mini, 'utils', 'teamClub', 'service.js')))
);

var createTeamSelect = require(path.join(mini, 'utils', 'teamClub', 'createTeamSelect.js'));
var caps = require(path.join(mini, 'utils', 'teamMatchCapabilities.js'));

function runDefault(extra) {
  extra = extra || {};
  return createTeamSelect.listTeamsForCreateDefault({
    listMyTeams:
      extra.listMyTeams ||
      function () {
        return Promise.resolve({ ok: true, list: [] });
      },
    listMatches: extra.listMatches || function () { return []; },
    peekTeam: extra.peekTeam || function () { return null; },
    getCurrentUser: extra.getCurrentUser || function () { return { userId: 'u-me' }; },
    matchManageAccess: extra.matchManageAccess || {
      isCreatorOfMatch: function (match) {
        return String((match && (match.creatorUserId || match.createdBy)) || '') === 'u-me';
      }
    },
    caps: caps
  });
}

function idsOf(res) {
  return ((res && res.list) || []).map(function (row) {
    return String(row.teamId || row.id);
  });
}

function finishReport() {
  console.log('\npassed=' + passed + ' failed=' + failed);
  if (failures.length) {
    console.log(failures.join('\n'));
    process.exit(1);
  }
}

Promise.resolve()
  .then(function () {
    return runDefault({
      listMyTeams: function () {
        return Promise.resolve({
          ok: true,
          list: [{ id: 'T-mine', name: '我的一队', logo: 'https://logo/mine.png' }]
        });
      }
    }).then(function (res) {
      assert(
        'Case1 冷 snapshot + listMyTeams 出现我的球队',
        res.ok &&
          idsOf(res).indexOf('T-mine') >= 0 &&
          res.list[0].isMyTeam === true &&
          res.list[0].source === 'my_team'
      );
    });
  })
  .then(function () {
    return runDefault({
      listMatches: function () {
        return [
          {
            matchId: 'M-in',
            matchType: 'team-internal',
            teamId: 'T-hist-in',
            organizationId: 'ORG-SHOULD-NOT',
            teamName: '队内历史队',
            teamLogo: 'https://logo/in.png',
            creatorUserId: 'u-me',
            updatedAt: 200
          }
        ];
      }
    }).then(function (res) {
      var ids = idsOf(res);
      assert(
        'Case2 空我的球队 + 自建队内赛出现 match.teamId',
        ids.indexOf('T-hist-in') >= 0 && ids.indexOf('ORG-SHOULD-NOT') < 0
      );
    });
  })
  .then(function () {
    return runDefault({
      listMatches: function () {
        return [
          {
            matchId: 'M-inter',
            matchType: 'inter-team',
            teamId: 'ORG-HOST',
            organizationId: 'ORG-HOST',
            creatorUserId: 'u-me',
            updatedAt: 300,
            teamGroups: [
              {
                sourceTeamId: 'T-a',
                sourceTeamName: '甲队',
                sourceTeamShortName: '甲',
                sourceTeamLogo: 'https://logo/a.png'
              },
              {
                sourceTeamId: 'T-b',
                sourceTeamName: '乙队',
                sourceTeamShortName: '乙',
                sourceTeamLogo: 'https://logo/b.png'
              }
            ]
          }
        ];
      }
    }).then(function (res) {
      var ids = idsOf(res);
      assert(
        'Case3 自建队际赛出现 teamGroups.sourceTeamId',
        ids.indexOf('T-a') >= 0 &&
          ids.indexOf('T-b') >= 0 &&
          ids.indexOf('ORG-HOST') < 0
      );
    });
  })
  .then(function () {
    return runDefault({
      listMyTeams: function () {
        return Promise.resolve({
          ok: true,
          list: [{ id: 'T-dup', name: '云端名', logo: 'https://logo/cloud.png' }]
        });
      },
      listMatches: function () {
        return [
          {
            matchId: 'M-dup',
            matchType: 'team-internal',
            teamId: 'T-dup',
            teamName: '历史名',
            creatorUserId: 'u-me',
            updatedAt: 9
          }
        ];
      }
    }).then(function (res) {
      var hits = (res.list || []).filter(function (row) {
        return row.teamId === 'T-dup';
      });
      assert(
        'Case4 同 teamId 去重且 isMyTeam',
        hits.length === 1 &&
          hits[0].isMyTeam === true &&
          hits[0].source === 'my_team' &&
          hits[0].name === '云端名' &&
          hits[0].lastUsedAt === 9
      );
    });
  })
  .then(function () {
    return runDefault({
      peekTeam: function () {
        return null;
      },
      listMatches: function () {
        return [
          {
            matchId: 'M-orphan',
            matchType: 'inter-team',
            teamId: 'ORG-X',
            organizationId: 'ORG-X',
            creatorUserId: 'u-me',
            updatedAt: 11,
            teamGroups: [
              {
                sourceTeamId: 'T123',
                sourceTeamName: '老鹰队',
                sourceTeamLogo: 'https://logo/eagle.png'
              }
            ]
          }
        ];
      }
    }).then(function (res) {
      var row = (res.list || []).filter(function (item) {
        return item.teamId === 'T123';
      })[0];
      assert(
        'Case5 snapshot 缺失仍能用历史名/logo 构造候选',
        !!row && row.name === '老鹰队' && String(row.logo).indexOf('eagle') >= 0
      );
    });
  })
  .then(function () {
    return runDefault({
      listMatches: function () {
        return [
          {
            matchId: 'M-other',
            matchType: 'team-internal',
            teamId: 'T-other',
            teamName: '别人的队',
            creatorUserId: 'u-other',
            createdBy: 'u-other',
            updatedAt: 1
          }
        ];
      }
    }).then(function (res) {
      assert('Case6 非自己创建的比赛不进历史', idsOf(res).indexOf('T-other') < 0);
    });
  })
  .then(function () {
    return createTeamSelect.searchTeamsForCreate('老鹰队').then(function (res) {
      var searchUi = require(path.join(mini, 'utils', 'teamSelectSearchUi.js'));
      var emptyUi = searchUi.resolveTeamSelectEmptyUi({
        searchKeyword: '老鹰队',
        teamCount: (res.list || []).length,
        searchImplemented: res.implemented === true,
        searchOk: res.ok === true,
        isEventOrg: false
      });
      assert(
        'Case7 非空 keyword → implemented:true + 空 list → 立即创建空态',
        res.ok === true &&
          Array.isArray(res.list) &&
          res.list.length === 0 &&
          res.implemented === true &&
          emptyUi.showSearchCreateEmpty === true &&
          emptyUi.showSearchUnavailable === false
      );
    });
  })
  .then(function () {
    return createTeamSelect.searchTeamsForCreate('   ').then(function (res) {
      assert(
        '空 keyword 仍 implemented:false，不触发搜索空态',
        res.ok === true && res.list.length === 0 && res.implemented === false
      );
    });
  })
  .then(function () {
    var defaultTeams = [{ id: 'T-mine', teamId: 'T-mine', name: '我的一队' }];
    var searchResults = [];
    function visible(keyword) {
      var q = String(keyword || '').trim();
      if (q) return searchResults;
      return defaultTeams;
    }
    var restored = visible('');
    assert(
      'Case8 清空 keyword 恢复 defaultTeams',
      restored === defaultTeams &&
        newJs.indexOf('this._searchResults = []') >= 0 &&
        /clearSearch\(\)[\s\S]*refreshTeams/.test(newJs)
    );
  })
  .then(function () {
    return runDefault({
      listMyTeams: function () {
        return Promise.resolve({
          ok: true,
          list: [
            { id: 'ORG-EVT', name: '某协会', organizationType: 'event_org' },
            { id: 'T-club', name: '俱乐部队' }
          ]
        });
      }
    }).then(function (res) {
      var ids = idsOf(res);
      assert(
        'Case9 event_org 不混入默认俱乐部队列表',
        ids.indexOf('ORG-EVT') < 0 &&
          ids.indexOf('T-club') >= 0 &&
          newJs.indexOf('listSelectableEventOrganizations(searchKeyword)') >= 0
      );
    });
  })
    .then(function () {
    return runDefault({
      listMyTeams: function () {
        return Promise.reject(new Error('cloud down'));
      },
      listMatches: function () {
        return [
          {
            matchId: 'M-fallback',
            matchType: 'team-internal',
            teamId: 'T-fb',
            teamName: '降级队',
            creatorUserId: 'u-me',
            updatedAt: 4
          }
        ];
      }
    }).then(function (res) {
      assert(
        'listMyTeams 失败仍展示本地历史',
        res.ok && idsOf(res).indexOf('T-fb') >= 0
      );
    });
  })
  .then(function () {
    var searchUi = require(path.join(mini, 'utils', 'teamSelectSearchUi.js'));
    var c1 = searchUi.resolveTeamSelectEmptyUi({
      searchKeyword: '老鹰队',
      teamCount: 0,
      searchImplemented: false,
      searchOk: true,
      isEventOrg: false
    });
    assert(
      'Search Case1 implemented:false 不显示不存在/立即创建',
      c1.showSearchCreateEmpty === false &&
        c1.showSearchUnavailable === true &&
        wxml.indexOf('wx:if="{{showSearchCreateEmpty}}"') >= 0 &&
        wxml.indexOf('openCreateTeam') >= 0 &&
        wxml.indexOf('暂无搜索结果') >= 0 &&
        newJs.indexOf('_searchImplemented') >= 0 &&
        newJs.indexOf('res.implemented') >= 0 &&
        ((wxml.match(/showSearchUnavailable[\s\S]*?暂无搜索结果[\s\S]*?<\/view>/) || [])[0] || '').indexOf(
          '目前不存在'
        ) < 0
    );

    var c2 = searchUi.resolveTeamSelectEmptyUi({
      searchKeyword: '老鹰队',
      teamCount: 1,
      searchImplemented: true,
      searchOk: true,
      isEventOrg: false
    });
    assert(
      'Search Case2 implemented:true 有结果不显示创建空态',
      c2.showSearchCreateEmpty === false && c2.showSearchUnavailable === false
    );

    var c3 = searchUi.resolveTeamSelectEmptyUi({
      searchKeyword: '老鹰队',
      teamCount: 0,
      searchImplemented: true,
      searchOk: true,
      isEventOrg: false
    });
    assert(
      'Search Case3 implemented:true 空列表显示可创建空态',
      c3.showSearchCreateEmpty === true && c3.showSearchUnavailable === false
    );

    var c4 = searchUi.resolveTeamSelectEmptyUi({
      searchKeyword: '某某协会',
      teamCount: 0,
      searchImplemented: false,
      searchOk: false,
      isEventOrg: true
    });
    assert(
      'Search Case4 event_org 本地 0 条仍可立即创建',
      c4.showSearchCreateEmpty === true &&
        c4.showSearchUnavailable === false &&
        newJs.indexOf('listSelectableEventOrganizations') >= 0
    );

    assert(
      'Search Case5 清空 keyword 重置搜索态并恢复 defaultTeams',
      newJs.indexOf('_resetClubSearchState') >= 0 &&
        /clearSearch\(\)[\s\S]*_resetClubSearchState[\s\S]*refreshTeams/.test(newJs) &&
        searchUi.resolveTeamSelectEmptyUi({
          searchKeyword: '',
          teamCount: 0,
          searchImplemented: false,
          searchOk: true
        }).showSearchCreateEmpty === false &&
        searchUi.resolveTeamSelectEmptyUi({
          searchKeyword: '',
          teamCount: 0,
          searchImplemented: false,
          searchOk: true
        }).showSearchUnavailable === false
    );

    assert(
      'Search Case6 创建后单选自动选中、多选走简称',
      newJs.indexOf('selectedId: team.id') >= 0 &&
        /isParticipantMode[\s\S]*_toggleParticipant\(String\(team\.id\)\)/.test(newJs) &&
        /const finish = \(team\) => \{[\s\S]*_resetClubSearchState/.test(newJs) &&
        newJs.indexOf("mode: 'create'") >= 0 &&
        newJs.indexOf('submitCreateTeam') >= 0 &&
        newJs.indexOf('buildCreateTeamUrl') < 0
    );

    assert(
      '测试期创建仍走本页 mode=create + teamClub.createTeam',
      /openCreateTeam\(\)[\s\S]*mode: 'create'/.test(newJs) &&
        /ORGANIZATION_TYPES\.TEAM[\s\S]*teamClub\s*\n?\s*\.createTeam\(/.test(newJs) &&
        newJs.indexOf('listTeamsForCreateDefault') >= 0 &&
        newJs.indexOf('listSelectableEventOrganizations') >= 0 &&
        createSelectSrc.indexOf('snapshot.listTeams') < 0
    );

    var chooseBlock = (newJs.match(/chooseTeamLogo\(\) \{[\s\S]*?\n  \},/) || [])[0] || '';
    assert(
      'Logo Case1 选择时 pickAndUpload，form.logo 只写 persist 后的 durable',
      chooseBlock.indexOf('pickAndUpload') >= 0 &&
        chooseBlock.indexOf('chooseMedia') < 0 &&
        chooseBlock.indexOf('teamLogo.persistLogo(res.fileID)') >= 0 &&
        chooseBlock.indexOf("'createForm.logo': saved.logo") >= 0 &&
        chooseBlock.indexOf('tempFilePath') < 0
    );

    var submitBlock = (newJs.match(/submitCreateTeam\(\) \{[\s\S]*?\n    const finish =/) || [])[0] || '';
    assert(
      'Logo Case2/6 提交 createTeam 使用 persistLogo 后的 durable，不含 temp',
      submitBlock.indexOf('teamLogo.persistLogo(this.data.createForm.logo)') >= 0 &&
        /createTeam\(\{[\s\S]*logo: payload\.logo/.test(newJs) &&
        submitBlock.indexOf('if (!logoChecked.ok)') >= 0
    );

    assert(
      'Logo Case3 上传失败 toast 且不 createTeam',
      /if \(!res \|\| !res\.ok\) \{[\s\S]*logoUploading: false[\s\S]*return;/.test(chooseBlock) &&
        chooseBlock.indexOf("title: teamAssetUpload.displayUploadError(res) || 'LOGO 上传失败'") >= 0
    );
    // Case3: failed branch must not set createForm.logo; success branch does. chooseBlock has success set. Refine:
    var failBranch = (chooseBlock.split('if (!saved.ok)')[0] || '');
    assert(
      'Logo Case3 失败分支不写入 createForm.logo',
      failBranch.indexOf("'createForm.logo': saved.logo") < 0 &&
        failBranch.indexOf('createTeam') < 0
    );

    assert(
      'Logo Case4 logoUploading 时 submit 被阻止',
      /submitCreateTeam\(\) \{[\s\S]*if \(this\.data\.logoUploading\) \{[\s\S]*return;/.test(newJs)
    );

    var teamLogoUtil = require(path.join(mini, 'utils', 'teamClub', 'teamLogo.js'));
    var emptyLogo = teamLogoUtil.persistLogo('');
    var durableLogo = teamLogoUtil.persistLogo('https://partnerlogo-1440519371.cos.ap-beijing.myqcloud.com/miniprogram/mock-avatars/mock-avatar-01.jpg');
    var tempLogo = teamLogoUtil.persistLogo('wxfile://tmp_logo.jpg');
    assert(
      'Logo Case5 未选择 logo persistLogo 允许空',
      emptyLogo.ok === true && emptyLogo.logo === '' &&
        newJs.indexOf('logoChecked.logo || mockAvatars.pickMockAvatar(name)') >= 0
    );
    assert(
      'Logo Case6 durable https persistLogo 通过',
      durableLogo.ok === true && /^https:\/\//.test(durableLogo.logo)
    );
    assert(
      'Logo Case7 残留 temp 被 persistLogo 二次闸拦住',
      tempLogo.ok === false &&
        submitBlock.indexOf('if (!logoChecked.ok)') >= 0 &&
        /if \(!logoChecked\.ok\) \{[\s\S]*return;[\s\S]*teamClub/.test(newJs)
    );
  })
  .then(finishReport)
  .catch(function (err) {
    failed += 1;
    failures.push('runtime: ' + (err && err.stack ? err.stack : err));
    finishReport();
  });

