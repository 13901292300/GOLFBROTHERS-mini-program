/**
 * 云查询分页：>200 条不漏、cursor 稳定、search 前缀、cloudStore 禁止 JS filter。
 * 不连接真实云环境。
 */

var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
var cloudLib = path.join(root, 'cloudfunctions', 'teamClub', 'lib');

var passed = 0;
var failed = 0;
function assert(label, ok) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label);
  }
}

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var C = require(path.join(cloudLib, 'constants.js'));
var scoreShards = require(path.join(cloudLib, 'scoreShards.js'));

function call(store, openid, action, payload) {
  return engine.dispatch(store, { OPENID: openid }, { action: action, payload: payload || {} });
}

async function collectAll(store, openid, action, payload, pickId) {
  var acc = [];
  var seen = {};
  var cursor = '';
  var hasMore = true;
  var pages = 0;
  while (hasMore && pages < 20) {
    pages += 1;
    var res = await call(store, openid, action, Object.assign({}, payload, { cursor: cursor, limit: 50 }));
    if (!res.ok) return { ok: false, res: res, acc: acc };
    var list = res.data || [];
    list.forEach(function (row) {
      var id = pickId(row);
      if (seen[id]) seen[id] += 1;
      else {
        seen[id] = 1;
        acc.push(row);
      }
    });
    hasMore = !!res.hasMore;
    cursor = res.cursor || '';
    if (hasMore && !cursor) break;
  }
  return { ok: true, acc: acc, seen: seen, pages: pages };
}

async function main() {
  var cloudSrc = fs.readFileSync(path.join(cloudLib, 'cloudStore.js'), 'utf8');
  var querySrc = fs.readFileSync(path.join(cloudLib, 'queryUtil.js'), 'utf8');
  var queryLayer = cloudSrc + '\n' + querySrc;
  assert('cloudStore 使用 where', queryLayer.indexOf('.where(') >= 0);
  assert('cloudStore 使用 orderBy', queryLayer.indexOf('.orderBy(') >= 0);
  assert('cloudStore 无 limit(200)', cloudSrc.indexOf('limit(200)') < 0);
  assert('cloudStore 无 JS pred filter', !/list\.filter\(pred\)/.test(cloudSrc));
  var engineSrc = fs.readFileSync(path.join(cloudLib, 'engine.js'), 'utf8');
  assert('searchUsers 不做 contains 扫描', engineSrc.indexOf('indexOf(query.toLowerCase())') < 0);

  var store = memoryStore.createMemoryStore();
  var oidOwner = 'oid_page_owner';
  var pOwner = await call(store, oidOwner, 'createMyProfile', { displayName: '分页队长' });
  assert('建档', pOwner.ok);
  var created = await call(store, oidOwner, 'createTeam', { name: '分页球队' });
  assert('建队', created.ok);
  var teamId = created.data.teamId;

  var extraUids = [];
  await store.runTransaction(function (tx) {
    var chain = Promise.resolve();
    for (var i = 0; i < 200; i++) {
      (function (n) {
        chain = chain.then(function () {
          var uid = 'u_page_member_' + String(n).padStart(3, '0');
          extraUids.push(uid);
          var now = 1e12 + n;
          return tx.put(C.COLLECTIONS.MEMBERS, C.memberDocId(teamId, uid), {
            memberId: 'tm_p_' + n,
            teamId: teamId,
            userId: uid,
            displayName: '成员' + n,
            searchKey: '成员' + n,
            role: C.ROLES.MEMBER,
            isCaptain: false,
            grants: [],
            memberStatus: C.MEMBER_STATUS.ACTIVE,
            joinedAt: now,
            leftAt: 0,
            updatedAt: now
          });
        });
      })(i);
    }
    return chain.then(function () {
      return tx.get(C.COLLECTIONS.CLUBS, teamId).then(function (team) {
        team.memberCount = 201;
        return tx.put(C.COLLECTIONS.CLUBS, teamId, team);
      });
    });
  });

  var membersPage = await collectAll(store, oidOwner, 'listMembers', { teamId: teamId }, function (m) {
    return m.userId;
  });
  assert('成员分页凑齐 201', membersPage.ok && membersPage.acc.length === 201);
  assert('第201名成员可找到', membersPage.acc.some(function (m) { return m.userId === extraUids[199]; }));
  assert('成员无重复', Object.keys(membersPage.seen).every(function (k) { return membersPage.seen[k] === 1; }));

  await store.runTransaction(function (tx) {
    var chain = Promise.resolve();
    for (var a = 0; a < 201; a++) {
      (function (n) {
        chain = chain.then(function () {
          var id = 'ja_page_' + String(n).padStart(3, '0');
          return tx.put(C.COLLECTIONS.APPLICATIONS, id, {
            applicationId: id,
            teamId: teamId,
            userId: 'u_app_' + n,
            displayName: '申请' + n,
            status: C.APP_STATUS.PENDING,
            createdAt: 2e12 + n,
            version: 1
          });
        });
      })(a);
    }
    for (var inv = 0; inv < 201; inv++) {
      (function (n) {
        chain = chain.then(function () {
          var id = 'inv_page_' + String(n).padStart(3, '0');
          return tx.put(C.COLLECTIONS.INVITES, id, {
            inviteId: id,
            tokenHash: 'th_page_' + n,
            teamId: teamId,
            status: C.INVITE_STATUS.ACTIVE,
            createdAt: 3e12 + n,
            updatedAt: 3e12 + n,
            expiresAt: 9e12
          });
        });
      })(inv);
    }
    for (var nt = 0; nt < 201; nt++) {
      (function (n) {
        chain = chain.then(function () {
          var id = 'nt_page_' + String(n).padStart(3, '0');
          return tx.put(C.COLLECTIONS.NOTICES, id, {
            noticeId: id,
            recipientUserId: pOwner.data.userId,
            teamId: teamId,
            createdAt: 4e12 + n,
            title: '通知' + n
          });
        });
      })(nt);
    }
    for (var mt = 0; mt < 201; mt++) {
      (function (n) {
        chain = chain.then(function () {
          var id = 'gm_page_' + String(n).padStart(3, '0');
          return tx.put(C.COLLECTIONS.MATCHES, id, {
            matchId: id,
            teamId: teamId,
            creatorUserId: pOwner.data.userId,
            createdAt: 5e12,
            updatedAt: 5e12 + n,
            version: 1,
            status: 'scheduled',
            visibility: 'team',
            participantUserIds: [pOwner.data.userId],
            body: { matchType: 'team-internal', roundName: '赛' + n },
            scoreSchemaVersion: 2
          });
        });
      })(mt);
    }
    return chain;
  });

  var apps = await collectAll(store, oidOwner, 'listApplications', { teamId: teamId, status: 'pending' }, function (row) {
    return row.applicationId;
  });
  assert('第201条申请可加载', apps.ok && apps.acc.length === 201 && apps.acc.some(function (x) { return x.applicationId === 'ja_page_000'; }));

  var invites = await collectAll(store, oidOwner, 'listInvites', { teamId: teamId, status: 'active' }, function (row) {
    return row.inviteId;
  });
  assert('第201条邀请可加载', invites.ok && invites.acc.length === 201);

  var notices = await collectAll(store, oidOwner, 'listNotices', {}, function (row) {
    return row.noticeId;
  });
  assert('第201条通知可加载', notices.ok && notices.acc.length === 201);

  var matches = await collectAll(store, oidOwner, 'listTeamMatches', { teamId: teamId }, function (row) {
    return row.matchId;
  });
  assert('第201场比赛可加载', matches.ok && matches.acc.length === 201 && matches.acc.some(function (x) { return x.matchId === 'gm_page_000'; }));

  var matchId = 'gm_score_page';
  await store.runTransaction(function (tx) {
    var now = Date.now();
    return tx
      .put(C.COLLECTIONS.MATCHES, matchId, {
        matchId: matchId,
        teamId: teamId,
        creatorUserId: pOwner.data.userId,
        createdAt: now,
        updatedAt: now,
        version: 1,
        status: 'live',
        visibility: 'team',
        participantUserIds: [pOwner.data.userId],
        body: { matchType: 'team-internal', roundName: '大分片' },
        scoreSchemaVersion: scoreShards.SCORE_SCHEMA_VERSION
      })
      .then(function () {
        var chain = Promise.resolve();
        for (var h = 1; h <= 201; h++) {
          (function (hole) {
            chain = chain.then(function () {
              var sid = scoreShards.scoreDocId(matchId, 'r1', hole, 'player', pOwner.data.userId);
              return tx.put(C.COLLECTIONS.MATCH_SCORES, sid, {
                matchId: matchId,
                teamId: teamId,
                roundId: 'r1',
                hole: hole,
                entityKind: 'player',
                entityId: pOwner.data.userId,
                strokes: 4,
                version: 1,
                updatedAt: now
              });
            });
          })(h);
        }
        return chain;
      });
  });
  var hydrated = await call(store, oidOwner, 'getMatch', { matchId: matchId });
  var versions = hydrated.ok && hydrated.data && hydrated.data.scoreVersions ? Object.keys(hydrated.data.scoreVersions) : [];
  assert('超过200个成绩分片完整组装', hydrated.ok && versions.length === 201);

  var sameTs = 7777777;
  await store.runTransaction(function (tx) {
    var chain = Promise.resolve();
    for (var i = 0; i < 30; i++) {
      (function (n) {
        chain = chain.then(function () {
          var id = 'nt_tie_' + String(n).padStart(2, '0');
          return tx.put(C.COLLECTIONS.NOTICES, id, {
            noticeId: id,
            recipientUserId: pOwner.data.userId,
            createdAt: sameTs,
            title: '同刻' + n
          });
        });
      })(i);
    }
    return chain;
  });
  var page1 = await call(store, oidOwner, 'listNotices', { limit: 10 });
  var page2 = await call(store, oidOwner, 'listNotices', { limit: 10, cursor: page1.cursor });
  var ids1 = (page1.data || []).map(function (x) { return x.noticeId; });
  var ids2 = (page2.data || []).map(function (x) { return x.noticeId; });
  var overlap = ids1.filter(function (id) { return ids2.indexOf(id) >= 0; });
  assert('相同排序键分页不重复', page1.ok && page2.ok && overlap.length === 0);
  assert('相同排序键分页有稳定 cursor', !!page1.cursor && page1.hasMore === true);

  var pOther = await call(store, 'oid_page_other', 'createMyProfile', { displayName: '前缀测用户' });
  var specs = [];
  var origQuery = store.query.bind(store);
  store.query = function (name, spec) {
    specs.push({ name: name, spec: spec });
    return origQuery(name, spec);
  };
  var miss = await call(store, oidOwner, 'searchUsers', { query: '不会命中的前缀zzzz' });
  var prefixHit = await call(store, oidOwner, 'searchUsers', { query: '前缀测' });
  var exact = await call(store, oidOwner, 'searchUsers', { query: pOther.data.userId });
  store.query = origQuery;
  var profileQueries = specs.filter(function (s) {
    return s.name === C.COLLECTIONS.PROFILES;
  });
  assert('用户搜索走 range/where 而非函数谓词', profileQueries.length >= 1 && profileQueries.every(function (s) {
    return s.spec && typeof s.spec !== 'function' && (s.spec.range || s.spec.where);
  }));
  assert('前缀未命中为空', miss.ok && Array.isArray(miss.data) && miss.data.length === 0);
  assert('前缀可命中显示名', prefixHit.ok && (prefixHit.data || []).some(function (u) {
    return u.userId === pOther.data.userId;
  }));
  assert('精确 userId 可查', exact.ok && (exact.data || []).some(function (u) {
    return u.userId === pOther.data.userId;
  }));

  var myTeams = await call(store, oidOwner, 'listMyTeams', { limit: 10 });
  assert('我的球队返回 cursor 字段', myTeams.ok && typeof myTeams.hasMore === 'boolean');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
