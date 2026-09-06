'use strict';

/**
 * 球队域唯一云函数入口。
 * 身份只来自微信云上下文 OPENID，不信任客户端 userId/role/ownerUserId。
 */

var engine = require('./lib/engine.js');
var log = require('./lib/log.js');
var errors = require('./lib/errors.js');
var cloudStore = require('./lib/cloudStore.js');

var cloud;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
} catch (e) {
  cloud = null;
}

exports.main = async function (event, context) {
  var wxContext = {};
  try {
    if (cloud && typeof cloud.getWXContext === 'function') {
      wxContext = cloud.getWXContext() || {};
    }
  } catch (err) {
    log.error('wx_context_unavailable');
    return errors.fail('need_login', '未登录');
  }

  if (!cloud || typeof cloud.database !== 'function') {
    return errors.fail('service_unavailable', '云数据库不可用');
  }

  var store = cloudStore.createCloudStore(cloud.database());
  store.deleteFiles = function (fileList) {
    if (!fileList || !fileList.length) {
      return Promise.resolve({ fileList: [] });
    }
    return cloud.deleteFile({ fileList: fileList });
  };
  return engine.dispatch(store, { OPENID: wxContext.OPENID }, event || {});
};

exports.__engine = engine;
