/**
 * 统一讨论区聊天系统（Discussion Chat System）—— 全局唯一实现
 * 被「记分页 / 球队比赛 / Game Hub」等所有赛事页面复用，禁止任何页面单独实现聊天逻辑。
 * 自包含 flex 面板：围观行(顶) → 聊天流(中，内部滚动) → 输入栏(底) + 表情面板(overlay)。
 * 输入系统 = 微信式：草稿/发送态/光标 + emoji 定点插入/删除，与之前已完成的讨论区完全一致。
 *
 * enableTimeNodes（默认 false）：微信群聊式时间节点投影；关闭时保持历史「今天」硬编码行为。
 */

var discussionTimeline = require('../../utils/discussionTimeline.js');
var playerLiveDisplay = require('../../utils/playerLiveDisplay.js');
var discussionMessageStore = require('../../utils/discussionMessageStore.js');
var discussionWatcherLayout = require('../../utils/discussionWatcherLayout.js');
var discussionVisitStore = require('../../utils/discussionVisitStore.js');
var discussionAvatarMention = require('../../utils/discussionAvatarMention.js');

const EMOJI_LIST = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😜', '🤔', '😎',
  '😭', '😡', '🥺', '😴', '🤤', '🙄', '😏', '😱', '😅', '😉',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '👌', '🤙', '🙌',
  '❤️', '💔', '💯', '🔥', '⭐', '🎉', '🎁', '☀️', '🌧️', '⛅',
  '⛳', '🏌️', '🏆', '🥇', '🥈', '🥉', '🍺', '☕', '🍵', '🍉',
  '😆', '😋', '😚', '🤗', '😇', '🤩', '😢', '😤', '😬', '🤭'
];

const SELF_AVATAR = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&h=120&q=80';

Component({
  options: {
    // 隔离样式：避免各宿主页面同名 .discussion-* 样式污染组件；
    // CSS 自定义变量（主题 token）属继承值，隔离不影响其向组件内继承，主题仍自动适配。
    styleIsolation: 'isolated'
  },

  properties: {
    // 围观头像列表：[{ name, avatar }]
    watchers: { type: Array, value: [] },
    // 初始聊天消息：普通 [{ self, name, avatar, text, mention }]；系统 [{ type:'system', action, text, timestamp }]
    messages: { type: Array, value: [] },
    // 主题：'dark' | 'bright'（驱动聊天气泡等硬编码色，token 色走 CSS 变量自动继承）
    theme: { type: String, value: 'bright' },
    // 字体大小：'normal' | 'large'（与 fontScale_global / 宿主显示设置对齐）
    fontScale: { type: String, value: 'normal' },
    // 当前用户头像（发送的消息使用）
    selfAvatar: { type: String, value: '' },
    selfName: { type: String, value: '' },
    // 输入栏是否固定到页面底部（默认 false，保持历史行为）
    fixedInput: { type: Boolean, value: false },
    // 输入栏显隐控制（默认 true）
    showInputBar: { type: Boolean, value: true },
    /**
     * 输入栏只读禁用（默认 false，保持 detail/score/hub 可输入行为）。
     * true 时：不可输入、不可发送、不可开表情/插入 @；placeholder 可定制。
     */
    inputDisabled: { type: Boolean, value: false },
    // 输入框占位文案；空字符串时回退「说点什么…」
    inputPlaceholder: { type: String, value: '' },
    // 内容不足时由宿主注入的底部补齐高度（px），渲染在聊天列表末尾
    bottomSpacerHeight: { type: Number, value: 0 },
    // 是否渲染组件内围观行（宿主页面可外置二级 sticky 层时设为 false）
    showWatchersStrip: { type: Boolean, value: true },
    /**
     * 微信群聊式时间节点（默认关闭，保持 detail/score/hub 现有行为）。
     * 开启后：空列表不显示「今天」；时间节点仅存在于 chatView 投影。
     */
    enableTimeNodes: { type: Boolean, value: false },
    /**
     * reaction self 动画播放中：按消息 index 隐藏该条头像（占位，不删节点）。
     * -1 表示未隐藏；须与 reactionDetachedUserId 一并由宿主在 onSeatDetach 时写入。
     */
    reactionDetachedMessageIndex: { type: Number, value: -1 },
    reactionDetachedUserId: { type: String, value: '' },
    /**
     * 本地讨论房间键（series:/match:/game:）。有值时发送先落盘再展示。
     */
    roomKey: { type: String, value: '' },
    watchersSharedHint: { type: String, value: '' }
  },

  data: {
    chat: [],
    chatView: [],
    toView: '',
    draft: '',
    canSend: false,
    cursor: 0,
    emojiPanelOpen: false,
    emojiPanelBottom: 0,
    emojiList: EMOJI_LIST,
    // @提及：已插入的 mention 对象列表 [{ userId, userName, displayText }]
    mentions: [],
    // 控制 textarea 聚焦（@插入后保持/恢复 focus）
    inputFocus: false,
    visibleWatchers: [],
    showWatchersMore: false,
    showWatchersSheet: false,
    watchersHint: ''
  },

  observers: {
    roomKey() {
      this._userTouched = false;
    },
    // 外部 messages 变化时同步内部聊天流（用户已发言后不再被外部覆盖）
    messages(list) {
      if (this._userTouched) return;
      this._applyChat((list || []).slice(), true);
    },
    enableTimeNodes() {
      this._applyChat(this.data.chat || [], false);
    },
    showInputBar(show) {
      if (!show && this.data.emojiPanelOpen) {
        this.setData({ emojiPanelOpen: false });
      }
    },
    inputDisabled(disabled) {
      if (!disabled) return;
      const patch = {
        draft: '',
        canSend: false,
        mentions: [],
        inputFocus: false
      };
      if (this.data.emojiPanelOpen) patch.emojiPanelOpen = false;
      this.setData(patch);
    },
    watchers() {
      this._applyWatcherStrip();
    },
    watchersSharedHint(hint) {
      this.setData({
        watchersHint:
          hint ||
          (discussionVisitStore.sharedMeta && discussionVisitStore.sharedMeta().hint) ||
          ''
      });
    }
  },

  lifetimes: {
    attached() {
      var meta = discussionVisitStore.sharedMeta();
      this.setData({
        watchersHint: this.properties.watchersSharedHint || meta.hint || ''
      });
      this._onWinResize = () => this._scheduleStripMeasure();
      if (typeof wx !== 'undefined' && typeof wx.onWindowResize === 'function') {
        wx.onWindowResize(this._onWinResize);
      }
      this._applyWatcherStrip();
    },
    detached() {
      if (this._stripMeasureTimer) {
        clearTimeout(this._stripMeasureTimer);
        this._stripMeasureTimer = null;
      }
      if (
        this._onWinResize &&
        typeof wx !== 'undefined' &&
        typeof wx.offWindowResize === 'function'
      ) {
        wx.offWindowResize(this._onWinResize);
      }
    }
  },

  pageLifetimes: {
    show() {
      this._applyChat(this.data.chat || [], false);
      this._scheduleStripMeasure();
    }
  },

  methods: {
    _isInputDisabled() {
      return !!this.properties.inputDisabled;
    },

    _windowWidth() {
      try {
        const info = wx.getSystemInfoSync();
        if (info && info.windowWidth) return info.windowWidth;
      } catch (e) {
        /* ignore */
      }
      return 375;
    },

    _applyWatcherStrip() {
      const list = Array.isArray(this.properties.watchers)
        ? this.properties.watchers
        : [];
      const ww = this._windowWidth();
      const fb = discussionWatcherLayout.fallbackMetrics(ww);
      const layout = discussionWatcherLayout.computeVisibleCount({
        total: list.length,
        containerWidth: this._stripWidth || ww,
        padPx: this._stripPad || fb.padPx,
        labelWidth: this._stripLabel || fb.labelWidth,
        itemWidth: this._stripItem || fb.itemWidth,
        gapPx: this._stripGap || fb.gapPx,
        moreWidth: this._stripMore || fb.moreWidth
      });
      const sliced = discussionWatcherLayout.sliceVisible(list, layout);
      this.setData(sliced, () => this._scheduleStripMeasure());
    },

    _scheduleStripMeasure() {
      if (!this.properties.showWatchersStrip) return;
      if (this._stripMeasureTimer) clearTimeout(this._stripMeasureTimer);
      this._stripMeasureTimer = setTimeout(() => this._measureStrip(), 16);
    },

    _measureStrip() {
      if (!this.properties.showWatchersStrip) return;
      const self = this;
      this.createSelectorQuery()
        .in(this)
        .select('.tab-watchers-strip')
        .boundingClientRect()
        .select('.ws-measure .discussion-watchers-label')
        .boundingClientRect()
        .select('.ws-measure .ws-person')
        .boundingClientRect()
        .select('.ws-measure .discussion-more-btn')
        .boundingClientRect()
        .exec(function (res) {
          const strip = res && res[0];
          const label = res && res[1];
          const person = res && res[2];
          const more = res && res[3];
          if (!strip || !strip.width) return;
          const ww = self._windowWidth();
          const fb = discussionWatcherLayout.fallbackMetrics(ww);
          self._stripWidth = strip.width;
          self._stripPad = fb.padPx;
          self._stripLabel = (label && label.width) || fb.labelWidth;
          self._stripItem = (person && person.width) || fb.itemWidth;
          self._stripGap = fb.gapPx;
          self._stripMore = (more && more.width) || fb.moreWidth;
          const list = Array.isArray(self.properties.watchers)
            ? self.properties.watchers
            : [];
          const layout = discussionWatcherLayout.computeVisibleCount({
            total: list.length,
            containerWidth: self._stripWidth,
            padPx: self._stripPad,
            labelWidth: self._stripLabel,
            itemWidth: self._stripItem,
            gapPx: self._stripGap,
            moreWidth: self._stripMore
          });
          const sliced = discussionWatcherLayout.sliceVisible(list, layout);
          const vis = self.data.visibleWatchers || [];
          if (
            sliced.showWatchersMore === self.data.showWatchersMore &&
            vis.length === sliced.visibleWatchers.length
          ) {
            return;
          }
          self.setData(sliced);
        });
    },

    openWatchersSheet() {
      this.setData({ showWatchersSheet: true });
    },
    closeWatchersSheet() {
      this.setData({ showWatchersSheet: false });
    },

    _currentMentionUserId() {
      try {
        return playerLiveDisplay.currentAccountUserId();
      } catch (e) {
        return 'me';
      }
    },

    _mentionGateFromEvent(e) {
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      const fields = discussionAvatarMention.fieldsFromDataset(ds);
      return {
        ds: ds,
        fields: fields,
        gate: discussionAvatarMention.canMentionUser(fields, this._currentMentionUserId())
      };
    },

    /**
     * 原生 longpress：只 @，并吞掉随后可能到达的 tap。
     * 本人 / 演示用户静默忽略；无发言权限走 insertMention 提示。
     */
    onAvatarLongPress(e) {
      this._skipAvatarTap = true;
      const hit = this._mentionGateFromEvent(e);
      if (hit.ds.role === 'watcher-list') this.closeWatchersSheet();
      if (!hit.gate.ok) {
        if (hit.gate.reason === 'self' || hit.gate.reason === 'demo') return;
      }
      this.insertMention(hit.ds.userid, hit.ds.name);
    },

    /**
     * 原生 tap：打开原头像面板。长按已处理后不再打开。
     */
    onAvatarTap(e) {
      if (this._skipAvatarTap) {
        this._skipAvatarTap = false;
        return;
      }
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (ds.role === 'watcher-list') this.closeWatchersSheet();
      const userId = ds.userid != null ? String(ds.userid).trim() : '';
      const name = ds.name != null ? String(ds.name).trim() : '';
      const avatar = ds.avatar != null ? String(ds.avatar) : '';
      const index = ds.index;
      const payload = {
        userId: userId,
        avatar: avatar,
        name: name,
        index: index,
        avatarRect: null,
        role: ds.role || ''
      };
      const sel = ds.sel != null ? String(ds.sel).trim() : '';
      if (!sel) {
        this.triggerEvent('playerAvatarTap', payload);
        return;
      }
      const self = this;
      this.createSelectorQuery()
        .in(this)
        .select('#' + sel)
        .boundingClientRect((rect) => {
          if (rect) {
            payload.avatarRect = {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            };
          }
          self.triggerEvent('playerAvatarTap', payload);
        })
        .exec();
    },

    /**
     * @param {Array} chat
     * @param {boolean} scrollToEnd
     */
    _applyChat(chat, scrollToEnd) {
      const raw = Array.isArray(chat) ? chat : [];
      const list = playerLiveDisplay.overlayChatMessages(raw);
      const patch = { chat: list };
      if (this.properties.enableTimeNodes) {
        patch.chatView = discussionTimeline.projectDiscussionTimeline(list);
      } else {
        patch.chatView = [];
      }
      if (scrollToEnd) {
        patch.toView = list.length ? 'ds-msg-' + (list.length - 1) : '';
      }
      this.setData(patch);
    },

    /* ===== 输入：草稿 / 发送态 / 光标 ===== */
    onDraftInput(e) {
      if (this._isInputDisabled()) {
        this.setData({ draft: '', canSend: false, cursor: 0 });
        return;
      }
      const value = e.detail.value || '';
      const cursor = typeof e.detail.cursor === 'number' ? e.detail.cursor : value.length;
      this.setData({ draft: value, canSend: value.trim().length > 0, cursor });
    },
    onDraftBlur(e) {
      if (this._isInputDisabled()) {
        this.setData({ draft: '', canSend: false, cursor: 0, inputFocus: false });
        return;
      }
      const cursor = typeof e.detail.cursor === 'number' ? e.detail.cursor : (this.data.draft || '').length;
      // 失焦时记录光标位置并复位 focus 标志，确保后续 @插入能重新触发聚焦
      this.setData({ cursor, inputFocus: false });
    },

    /**
     * 追加系统提示（type=system），不走气泡、不受 _userTouched 阻断。
     * @param {{ text:string, action?:string, timestamp?:number }} payload
     */
    appendSystemMessage(payload) {
      const p = payload || {};
      const text = String(p.text || '').trim();
      if (!text) return;
      const chat = (this.data.chat || []).concat({
        type: 'system',
        action: p.action != null ? String(p.action) : '',
        text: text,
        timestamp: p.timestamp != null ? p.timestamp : Date.now()
      });
      this._applyChat(chat, true);
    },

    // 发送：空内容禁止；本地保存成功后才展示并清空草稿
    onSend() {
      if (this._isInputDisabled()) {
        wx.showToast({ title: '当前没有发言权限', icon: 'none' });
        return;
      }
      const text = (this.data.draft || '').trim();
      if (!text) return;
      const roomKey = this.properties.roomKey != null ? String(this.properties.roomKey).trim() : '';
      if (!roomKey) {
        wx.showToast({ title: '讨论无法保存', icon: 'none' });
        return;
      }
      const mentions = (this.data.mentions || []).slice();
      const createdAt = Date.now();
      const stamped = playerLiveDisplay.stampCurrentAccountOnWrite({
        self: true,
        text: text,
        mention: '',
        mentions: mentions,
        createdAt: createdAt
      });
      const message = Object.assign(
        {
          self: true,
          userId: 'me',
          name: this.properties.selfName || '我',
          avatar: this.properties.selfAvatar || ''
        },
        stamped,
        {
          id: discussionMessageStore.createMessageId(createdAt),
          text: text,
          mention: '',
          mentions: mentions,
          createdAt: createdAt,
          self: true,
          demo: false
        }
      );
      if (!message.name) message.name = '我';
      const saved = discussionMessageStore.appendMessage(roomKey, message);
      if (!saved || !saved.ok) {
        wx.showToast({
          title: (saved && saved.error) || '发送失败，请重试',
          icon: 'none'
        });
        return;
      }
      this._userTouched = true;
      const chat = playerLiveDisplay.overlayChatMessages(
        discussionMessageStore.listMessages(roomKey)
      );
      const patch = {
        draft: '',
        canSend: false,
        cursor: 0,
        emojiPanelOpen: false,
        mentions: []
      };
      patch.chat = chat;
      patch.toView = chat.length ? 'ds-msg-' + (chat.length - 1) : '';
      if (this.properties.enableTimeNodes) {
        patch.chatView = discussionTimeline.projectDiscussionTimeline(chat);
      }
      this.setData(patch);
      this.triggerEvent('send', {
        text: text,
        mentions: mentions,
        createdAt: createdAt,
        message: saved.message,
        roomKey: roomKey
      });
    },

    // 在光标位置插入「@用户名 」，保存稳定 userId；无发言权限时提示且不插入
    insertMention(userId, userName) {
      if (this._isInputDisabled()) {
        wx.showToast({ title: '当前没有发言权限', icon: 'none' });
        return;
      }
      const uid = userId != null ? String(userId).trim() : '';
      if (!uid) {
        wx.showToast({ title: '无法提及该用户', icon: 'none' });
        return;
      }
      const name = userName != null ? String(userName).trim() : '';
      if (!name) return;
      const token = '@' + name + ' ';
      const draft = this.data.draft || '';
      const len = draft.length;
      let pos = typeof this.data.cursor === 'number' ? this.data.cursor : len;
      if (pos < 0 || pos > len) pos = len;
      const next = draft.slice(0, pos) + token + draft.slice(pos);
      const mention = { userId: uid, userName: name, displayText: '@' + name };
      const mentions = (this.data.mentions || []).concat(mention);
      this.setData({
        draft: next,
        canSend: next.trim().length > 0,
        cursor: pos + token.length,
        mentions,
        inputFocus: true
      });
      this.triggerEvent('mention', mention);
    },

    /* ===== 表情面板 ===== */
    toggleEmojiPanel() {
      if (this._isInputDisabled()) return;
      if (this.data.emojiPanelOpen) {
        this.setData({ emojiPanelOpen: false });
        return;
      }
      this.createSelectorQuery()
        .in(this)
        .select('.discussion-input-bar')
        .boundingClientRect((rect) => {
          const h = rect && rect.height ? Math.round(rect.height) : 112;
          this.setData({ emojiPanelBottom: h, emojiPanelOpen: true });
        })
        .exec();
    },
    closeEmojiPanel() {
      if (this.data.emojiPanelOpen) this.setData({ emojiPanelOpen: false });
    },

    // 定点插入 emoji（不覆盖已有文本，连续插入），面板保持打开
    insertEmoji(e) {
      if (this._isInputDisabled()) return;
      const emoji = e.currentTarget.dataset.emoji || '';
      if (!emoji) return;
      const draft = this.data.draft || '';
      const len = draft.length;
      let pos = typeof this.data.cursor === 'number' ? this.data.cursor : len;
      if (pos < 0 || pos > len) pos = len;
      const next = draft.slice(0, pos) + emoji + draft.slice(pos);
      this.setData({ draft: next, canSend: next.trim().length > 0, cursor: pos + emoji.length });
    },

    // 删除光标前一个字符（兼容 emoji 代理对）
    deleteEmoji() {
      if (this._isInputDisabled()) return;
      const draft = this.data.draft || '';
      const len = draft.length;
      let pos = typeof this.data.cursor === 'number' ? this.data.cursor : len;
      if (pos < 0 || pos > len) pos = len;
      if (pos <= 0) return;
      let removeLen = 1;
      const prev = draft.charCodeAt(pos - 1);
      if (prev >= 0xdc00 && prev <= 0xdfff && pos >= 2) removeLen = 2;
      const next = draft.slice(0, pos - removeLen) + draft.slice(pos);
      this.setData({ draft: next, canSend: next.trim().length > 0, cursor: pos - removeLen });
    },

    noop() {}
  }
});
