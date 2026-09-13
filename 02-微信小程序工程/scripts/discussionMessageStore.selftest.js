const path = require('path');
const store = require(path.join(__dirname, '../miniprogram/utils/discussionMessageStore.js'));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const mem = {};
store.setStorageAdapter({
  getStorageSync: function (k) {
    return mem[k];
  },
  setStorageSync: function (k, v) {
    mem[k] = v;
  }
});

assert(store.resolveRoomKey({ seriesId: 'S1', matchId: 'M1' }) === 'series:S1', 'series wins');
assert(store.resolveRoomKey({ matchId: 'M1', gameId: 'G1' }) === 'match:M1', 'match over game');
assert(store.resolveRoomKey({ gameId: 'G1' }) === 'game:G1', 'game key');
assert(store.resolveRoomKey({ seriesId: '  ' }) === '', 'blank series ignored');
assert(store.resolveRoomKey({ title: '周末局' }) === '', 'title is not a room key');

const k1 = store.resolveRoomKey({ matchId: 'match-a' });
const k2 = store.resolveRoomKey({ matchId: 'match-b' });
const a1 = store.appendMessage(k1, {
  userId: 'u1',
  text: 'hello',
  createdAt: 1000,
  name: '甲'
});
assert(a1.ok && a1.message.id, 'append ok');
const a2 = store.appendMessage(k1, {
  userId: 'u1',
  text: 'world',
  createdAt: 2000,
  name: '甲'
});
assert(a2.ok, 'second append');
assert(store.listMessages(k1).length === 2, 'two messages');
assert(store.listMessages(k1)[0].text === 'hello', 'order stable');
assert(store.listMessages(k2).length === 0, 'rooms isolated');

const dup = store.appendMessage(k1, Object.assign({}, a1.message));
assert(dup.ok && store.listMessages(k1).length === 2, 'same id not duplicated');

const demo = store.appendMessage(k1, { demo: true, text: '假消息', userId: 'chat-alex' });
assert(!demo.ok, 'demo not saved');
assert(store.listMessages(k1).every(function (m) { return m.text !== '假消息'; }), 'demo not in room');

const empty = store.appendMessage('', { text: 'x' });
assert(!empty.ok, 'empty key fails');

store.failNextWrite();
const fail = store.appendMessage(k1, { userId: 'u1', text: 'lost', createdAt: 3000 });
assert(!fail.ok, 'write fail');
assert(store.listMessages(k1).length === 2, 'fail does not keep unwritten');
assert(store.listMessages(k1).every(function (m) { return m.text !== 'lost'; }), 'failed text absent');

const emptyView = store.viewSource(k2, [{ demo: true, text: 'seed' }]);
assert(emptyView.length === 1 && emptyView[0].demo === true, 'empty room shows seeds');
const filledView = store.viewSource(k1, [{ demo: true, text: 'seed' }]);
assert(filledView.length === 2 && !filledView[0].demo, 'filled room hides seeds');

const legacyKey = 'gb_discussion_messages_v1';
mem[legacyKey] = {
  rooms: {
    'game:old': {
      messages: [{ id: 'old1', userId: 'u', text: 'legacy', createdAt: 9 }]
    }
  }
};
assert(store.listMessages('game:old')[0].text === 'legacy', 'legacy bucket.messages');

console.log('discussionMessageStore.selftest ok');
