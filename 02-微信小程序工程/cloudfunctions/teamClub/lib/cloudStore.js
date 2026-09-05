'use strict';

var C = require('./constants.js');

function createCloudStore(db) {
  if (!db) {
    throw new Error('cloud database required');
  }

  function nowMs() {
    return Date.now();
  }

  function unwrap(res) {
    if (!res) return null;
    if (res.data && !Array.isArray(res.data) && res.data._id) return res.data;
    if (res.data && Array.isArray(res.data)) return res.data;
    return res.data || null;
  }

  function txApi(transaction) {
    return {
      nowMs: nowMs,
      get: function (name, id) {
        return transaction
          .collection(name)
          .doc(String(id))
          .get()
          .then(function (res) {
            return res && res.data ? res.data : null;
          })
          .catch(function () {
            return null;
          });
      },
      put: function (name, id, doc) {
        var row = Object.assign({}, doc, { _id: String(id) });
        return transaction
          .collection(name)
          .doc(String(id))
          .set({ data: row })
          .then(function () {
            return row;
          });
      },
      remove: function (name, id) {
        return transaction
          .collection(name)
          .doc(String(id))
          .remove()
          .then(function () {
            return true;
          })
          .catch(function () {
            return false;
          });
      },
      query: function (name, pred) {
        return transaction
          .collection(name)
          .limit(200)
          .get()
          .then(function (res) {
            var list = (res && res.data) || [];
            if (!pred) return list;
            return list.filter(pred);
          });
      }
    };
  }

  return {
    nowMs: nowMs,
    runTransaction: function (fn) {
      return db.runTransaction(function (transaction) {
        return fn(txApi(transaction));
      });
    },
    get: function (name, id) {
      return db
        .collection(name)
        .doc(String(id))
        .get()
        .then(function (res) {
          return res && res.data ? res.data : null;
        })
        .catch(function () {
          return null;
        });
    },
    query: function (name, whereObj) {
      var ref = db.collection(name);
      if (whereObj && typeof whereObj === 'object' && !Array.isArray(whereObj)) {
        ref = ref.where(whereObj);
      }
      return ref.limit(100).get().then(function (res) {
        return (res && res.data) || [];
      });
    },
    collections: C.COLLECTIONS
  };
}

module.exports = {
  createCloudStore: createCloudStore
};
