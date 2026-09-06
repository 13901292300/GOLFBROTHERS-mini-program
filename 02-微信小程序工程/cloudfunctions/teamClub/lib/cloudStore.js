'use strict';

var C = require('./constants.js');
var queryUtil = require('./queryUtil.js');
var ser = require('./storeSerialize.js');

function createCloudStore(db) {
  if (!db) {
    throw new Error('cloud database required');
  }

  function nowMs() {
    return Date.now();
  }

  function queryCollection(collectionRef, spec) {
    return queryUtil.applyCloudQuery(db, collectionRef, spec);
  }

  function readDoc(res, id) {
    var data = res && res.data ? res.data : null;
    if (!data) return null;
    return ser.attachDocId(id, data);
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
            return readDoc(res, id);
          })
          .catch(function () {
            return null;
          });
      },
      put: function (name, id, doc) {
        var payload = ser.toSdkWriteData(doc);
        return transaction
          .collection(name)
          .doc(String(id))
          .set({ data: payload })
          .then(function () {
            return ser.attachDocId(id, payload);
          });
      },
      update: function (name, id, doc) {
        var payload = ser.toSdkWriteData(doc);
        return transaction
          .collection(name)
          .doc(String(id))
          .update({ data: payload })
          .then(function () {
            return ser.attachDocId(id, payload);
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
      query: function (name, spec) {
        return queryCollection(transaction.collection(name), spec);
      },
      queryAll: function (name, spec) {
        return queryUtil.queryAllFrom(function (n, s) {
          return queryCollection(transaction.collection(n), s);
        }, name, spec);
      }
    };
  }

  function query(name, spec) {
    return queryCollection(db.collection(name), spec);
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
          return readDoc(res, id);
        })
        .catch(function () {
          return null;
        });
    },
    query: query,
    queryAll: function (name, spec) {
      return queryUtil.queryAllFrom(query, name, spec);
    },
    collections: C.COLLECTIONS
  };
}

module.exports = {
  createCloudStore: createCloudStore
};
