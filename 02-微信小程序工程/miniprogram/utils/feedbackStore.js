/**
 * feedbackStore — 用户反馈持久化
 * 优先写入云数据库 collection `feedback`，失败时回落本地 storage。
 */

const STORAGE_KEY = 'gb_feedback_v1';

function createFeedbackId() {
  return 'fb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function readLocalList() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function appendLocal(record) {
  const list = readLocalList();
  list.unshift(record);
  try {
    wx.setStorageSync(STORAGE_KEY, list.slice(0, 100));
  } catch (e) {
    /* ignore */
  }
}

/**
 * TODO: 反馈创建后钩子 — 预留通知 / 后台管理接入，当前不实现。
 * @param {object} feedback
 */
function _afterFeedbackCreated(feedback) {
  // TODO: notify / admin pipeline
}

/**
 * @param {object} payload
 * @param {string} payload.content
 * @param {string[]} [payload.imageFileIDs]
 * @param {{ latitude: number, longitude: number }|null} [payload.location]
 * @param {string} [payload.phone]
 * @param {string} [payload.userId]
 * @param {string} [payload.source]
 * @param {string} [payload.sourcePage]
 * @param {string} [payload.matchId]
 * @param {string} [payload.gameId]
 * @returns {Promise<{ ok: boolean, feedbackId: string, source: string }>}
 */
function saveFeedback(payload) {
  const data = {
    feedbackId: createFeedbackId(),
    content: String((payload && payload.content) || '').trim(),
    imageFileIDs: Array.isArray(payload && payload.imageFileIDs) ? payload.imageFileIDs.slice(0, 5) : [],
    location: payload && payload.location
      ? {
          latitude: Number(payload.location.latitude),
          longitude: Number(payload.location.longitude)
        }
      : null,
    phone: String((payload && payload.phone) || '').trim(),
    userId: String((payload && payload.userId) || '').trim(),
    source: String((payload && payload.source) || '').trim(),
    sourcePage: String((payload && payload.sourcePage) || '').trim(),
    matchId: String((payload && payload.matchId) || '').trim(),
    gameId: String((payload && payload.gameId) || '').trim(),
    status: 'pending',
    notifyStatus: 'pending',
    createdAt: Date.now()
  };

  const finishOk = (persistSource) => {
    console.log('[feedback-upload] saveFeedback imageFileIDs', data.imageFileIDs, 'persistSource', persistSource);
    appendLocal(data);
    _afterFeedbackCreated(data);
    return { ok: true, feedbackId: data.feedbackId, source: persistSource };
  };

  if (!wx.cloud || typeof wx.cloud.database !== 'function') {
    console.log('[feedback-upload] saveFeedback cloud db unavailable → local');
    return Promise.resolve(finishOk('local'));
  }

  try {
    return wx.cloud
      .database()
      .collection('feedback')
      .add({ data: data })
      .then(() => finishOk('cloud'))
      .catch((err) => {
        console.log('[feedback-upload] saveFeedback cloud add fail', err && err.errMsg, err);
        return Promise.resolve(finishOk('local'));
      });
  } catch (e) {
    console.log('[feedback-upload] saveFeedback cloud add throw', e);
    return Promise.resolve(finishOk('local'));
  }
}

module.exports = {
  saveFeedback,
  readLocalList,
  _afterFeedbackCreated
};
