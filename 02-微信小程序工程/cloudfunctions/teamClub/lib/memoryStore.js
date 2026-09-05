'use strict';

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

  function col(name) {
    if (!data[name]) data[name] = {};
    return data[name];
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
        var row = clone(doc) || {};
        row._id = String(id);
        col(name)[String(id)] = row;
        return Promise.resolve(clone(row));
      },
      remove: function (name, id) {
        delete col(name)[String(id)];
        return Promise.resolve(true);
      },
      query: function (name, pred) {
        var map = col(name);
        var out = [];
        Object.keys(map).forEach(function (k) {
          var row = map[k];
          if (!pred || pred(row)) out.push(clone(row));
        });
        return Promise.resolve(out);
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
