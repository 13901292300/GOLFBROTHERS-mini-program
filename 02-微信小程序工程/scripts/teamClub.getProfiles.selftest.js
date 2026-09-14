/**
 * teamClub getProfiles：鉴权、去重、上限、白名单、缺失容错。
 * 运行：node scripts/teamClub.getProfiles.selftest.js
 */
var path = require('path');
var root = path.join(__dirname, '..');
var cloudLib = path.join(root, 'cloudfunctions', 'teamClub', 'lib');

var passed = 0;
var failed = 0;
function assert(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failed += 1;
    console.log('FAIL  ' + label + (detail ? ' :: ' + detail : ''));
  }
}

var engine = require(path.join(cloudLib, 'engine.js'));
var memoryStore = require(path.join(cloudLib, 'memoryStore.js'));
var C = require(path.join(cloudLib, 'constants.js'));

var OID = {
  a: 'oid_getprofiles_a',
  b: 'oid_getprofiles_b'
};

function call(store, openid, action, payload, extra) {
  return engine.dispatch(
    store,
    { OPENID: openid },
    Object.assign({ action: action, payload: payload || {} }, extra || {})
  );
}

async function main() {
  var store = memoryStore.createMemoryStore();

  var noAuth = await call(store, '', 'getProfiles', { userIds: ['u_x'] });
  assert('auth 无 OPENID need_login', noAuth.ok === false && noAuth.code === 'need_login');

  var needProfile = await call(store, OID.a, 'getProfiles', { userIds: [] });
  assert('auth 无档案 profile_required', needProfile.ok === false && needProfile.code === 'profile_required');

  var pA = await call(store, OID.a, 'createMyProfile', {
    displayName: 'AliceNick',
    avatar: 'https://example.com/alice.png'
  });
  var pB = await call(store, OID.b, 'createMyProfile', {
    displayName: 'BobNick',
    avatar: 'https://example.com/bob.png'
  });
  assert('建档 A/B', pA.ok && pB.ok && pA.data.userId && pB.data.userId);
  var idA = pA.data.userId;
  var idB = pB.data.userId;

  var empty = await call(store, OID.b, 'getProfiles', { userIds: [] });
  assert(
    'empty ids',
    empty.ok && empty.data && JSON.stringify(empty.data.profilesByUserId) === '{}' && Array.isArray(empty.data.missingUserIds)
  );

  var dups = await call(store, OID.b, 'getProfiles', { userIds: [idA, idA, '', null, idA] });
  assert('duplicate ids 只返回一份', dups.ok && dups.data.profilesByUserId[idA] && Object.keys(dups.data.profilesByUserId).length === 1);

  var capIds = [];
  var i;
  for (i = 0; i < 41; i++) {
    var hex = ('aaaaaaaaaaaaaaaaaaaa' + i.toString(16)).slice(-20);
    capIds.push('u_' + hex);
  }
  capIds[0] = idA;
  var cap = await call(store, OID.b, 'getProfiles', { userIds: capIds });
  var capCount = Object.keys((cap.data && cap.data.profilesByUserId) || {}).length + ((cap.data && cap.data.missingUserIds) || []).length;
  assert('max cap 40', cap.ok && capCount <= 40);

  var valid = await call(store, OID.b, 'getProfiles', { userIds: [idA] });
  var row = valid.data.profilesByUserId[idA];
  assert(
    'valid profile nickname 归一',
    valid.ok && row && row.userId === idA && row.nickname === 'AliceNick' && row.avatar === 'https://example.com/alice.png'
  );
  assert('valid 不暴露 displayName 历史名', row && row.displayName == null);

  var missingId = 'u_aaaaaaaaaaaaaaaaaaaa';
  var miss = await call(store, OID.b, 'getProfiles', { userIds: [missingId] });
  assert(
    'missing profile',
    miss.ok && !miss.data.profilesByUserId[missingId] && miss.data.missingUserIds.indexOf(missingId) >= 0
  );

  var mixed = await call(store, OID.b, 'getProfiles', { userIds: [idA, missingId] });
  assert(
    'mixed valid/missing 不整批失败',
    mixed.ok && mixed.data.profilesByUserId[idA] && mixed.data.missingUserIds.indexOf(missingId) >= 0
  );

  var raw = await store.get(C.COLLECTIONS.PROFILES, idA);
  assert('库内仍有 searchKey/openidHash', !!(raw && raw.searchKey && raw.openidHash));
  var dumped = JSON.stringify(valid.data);
  assert(
    'field whitelist 无 openid/phone/searchKey',
    dumped.indexOf('searchKey') < 0 &&
      dumped.indexOf('openidHash') < 0 &&
      dumped.indexOf('"openid"') < 0 &&
      dumped.indexOf('phone') < 0 &&
      dumped.indexOf('displayName') < 0
  );

  var rejected = await call(store, OID.b, 'getProfiles', {
    userIds: ['13800138000', 'openid-not-uid', 'fr-1003', 'guest_x', idA]
  });
  assert(
    '拒绝 phone/openid/伪 id',
    rejected.ok &&
      rejected.data.profilesByUserId[idA] &&
      !rejected.data.profilesByUserId['13800138000'] &&
      !rejected.data.profilesByUserId['openid-not-uid']
  );

  var constants = require(path.join(cloudLib, 'constants.js'));
  assert('constants 含 getProfiles', constants.EXTRA_METHODS.indexOf('getProfiles') >= 0);

  console.log('');
  console.log('passed=' + passed + ' failed=' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
