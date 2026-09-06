'use strict';

var queryUtil = require('./queryUtil.js');
var ser = require('./storeSerialize.js');

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function createMemoryStore(seed) {
  var data = seed && typeof seed === 'object'
    ? clone(seed)
    : {
        team_clubs: {},
        team_members: {},
        team_applications: {},
        team_invites: {},
        team_notices: {},
        team_audits: {},
        team_club_migrations: {},
        team_club_idempotency: {},
        user_profiles: {},
        team_application_locks: {},
        team_match_refs: {},
        team_matches: {},
        team_match_scores: {}
      };

  var nowFn = function () {
    return Date.now();
  };
  var chain = Promise.resolve();
  var sdkWrites = [];

  function col(name) {
    if (!data[name]) data[name] = {};
    return data[name];
  }

  function runQuery(name, spec) {
    var page = queryUtil.applyMemoryQuery(col(name), spec);
    return Promise.resolve({
      list: page.list.map(clone),
      cursor: page.cursor,
      hasMore: page.hasMore
    });
  }

  function sdkWrite(op, name, id, payload) {
    ser.assertSdkWriteData(payload);
    sdkWrites.push({
      op: op,
      collection: name,
      id: String(id),
      data: clone(payload)
    });
    var stored = ser.attachDocId(id, payload);
    col(name)[String(id)] = clone(stored);
    return clone(stored);
  }

  function api() {
    return {
      nowMs: function () {
        return nowFn();
      },
      get: function (name, id) {
        var row = col(name)[String(id)];
        return Promise.resolve(row ? clone(row) : null);
      },
      put: function (name, id, doc) {
        try {
          var payload = ser.toSdkWriteData(doc);
          return Promise.resolve(sdkWrite('set', name, id, payload));
        } catch (err) {
          return Promise.reject(err);
        }
      },
      update: function (name, id, doc) {
        try {
          var payload = ser.toSdkWriteData(doc);
          var existing = col(name)[String(id)];
          if (!existing) {
            return Promise.reject(new Error('document.update:fail not found'));
          }
          var merged = Object.assign({}, existing, payload);
          delete merged._id;
          delete merged._openid;
          return Promise.resolve(sdkWrite('update', name, id, merged));
        } catch (err) {
          return Promise.reject(err);
        }
      },
      remove: function (name, id) {
        delete col(name)[String(id)];
        return Promise.resolve(true);
      },
      query: function (name, spec) {
        return runQuery(name, spec);
      },
      queryAll: function (name, spec) {
        return queryUtil.queryAllFrom(runQuery, name, spec);
      }
    };
  }

  return {
    nowMs: function () {
      return nowFn();
    },
    setNowMs: function (fnOrNumber) {
      if (typeof fnOrNumber === 'function') nowFn = fnOrNumber;
      else {
        var n = Number(fnOrNumber);
        nowFn = function () {
          return n;
        };
      }
    },
    resetNow: function () {
      nowFn = function () {
        return Date.now();
      };
    },
    dump: function () {
      return clone(data);
    },
    deletedFiles: [],
    deleteFiles: function (fileList) {
      var list = Array.isArray(fileList) ? fileList : [];
      this.deletedFiles = (this.deletedFiles || []).concat(list);
      return Promise.resolve({
        fileList: list.map(function (id) {
          return { fileID: id, status: 0 };
        })
      });
    },
    getLastSdkWrites: function () {
      return clone(sdkWrites);
    },
    clearLastSdkWrites: function () {
      sdkWrites = [];
    },
    sdkSetRaw: function (name, id, data) {
      try {
        sdkWrite('set', name, id, data);
        return Promise.resolve(true);
      } catch (err) {
        return Promise.reject(err);
      }
    },
    get: function (name, id) {
      return api().get(name, id);
    },
    query: function (name, spec) {
      return runQuery(name, spec);
    },
    queryAll: function (name, spec) {
      return queryUtil.queryAllFrom(runQuery, name, spec);
    },
    runTransaction: function (fn) {
      var run = function () {
        return Promise.resolve(fn(api()));
      };
      chain = chain.then(run, run);
      return chain;
    }
  };
}

module.exports = {
  createMemoryStore: createMemoryStore
};
