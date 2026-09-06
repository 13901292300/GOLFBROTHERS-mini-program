'use strict';

function hasOwn(obj, key) {
  return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
}

function reservedWriteError() {
  var err = new Error('document.set:fail -501007 invalid parameters. 不能更新 _id 的值');
  err.code = -501007;
  err.errCode = -501007;
  return err;
}

function stripReservedFields(doc) {
  var data = {};
  var src = doc && typeof doc === 'object' ? doc : {};
  Object.keys(src).forEach(function (key) {
    if (key === '_id' || key === '_openid') return;
    data[key] = src[key];
  });
  return data;
}

function assertSdkWriteData(data) {
  if (hasOwn(data, '_id') || hasOwn(data, '_openid')) {
    throw reservedWriteError();
  }
  return data;
}

function toSdkWriteData(doc) {
  return assertSdkWriteData(stripReservedFields(doc));
}

function attachDocId(id, data) {
  if (data == null) return null;
  var row = Object.assign({}, data);
  if (row._id == null || row._id === '') row._id = String(id);
  return row;
}

module.exports = {
  stripReservedFields: stripReservedFields,
  assertSdkWriteData: assertSdkWriteData,
  toSdkWriteData: toSdkWriteData,
  attachDocId: attachDocId,
  reservedWriteError: reservedWriteError
};
