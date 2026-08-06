/**
 * 统一讨论区聊天系统（Discussion Chat System）—— 全局唯一实现
 * 被「记分页 / 球队比赛 / Game Hub」等所有赛事页面复用，禁止任何页面单独实现聊天逻辑。
 * 自包含 flex 面板：围观行(顶) → 聊天流(中，内部滚动) → 输入栏(底) + 表情面板(overlay)。
 * 输入系统 = 微信式：草稿/发送态/光标 + emoji 定点插入/删除，与之前已完成的讨论区完全一致。
 */

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
    selfAvatar: { type: String, value: SELF_AVATAR },
    // 输入栏是否固定到页面底部（默认 false，保持历史行为）
    fixedInput: { type: Boolean, value: false },
    // 输入栏显隐控制（默认 true）
    showInputBar: { type: Boolean, value: true },
    // 内容不足时由宿主注入的底部补齐高度（px），渲染在聊天列表末尾
    bottomSpacerHeight: { type: Number, value: 0 },
    // 是否渲染组件内围观行（宿主页面可外置二级 sticky 层时设为 false）
    showWatchersStrip: { type: Boolean, value: true }
  },

  data: {
    chat: [],
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
    inputFocus: false
  },

  observers: {
    // 外部 messages 变化时同步内部聊天流（用户已发言后不再被外部覆盖）
    messages(list) {
      if (this._userTouched) return;
      const chat = (list || []).slice();
      this.setData({ chat, toView: chat.length ? 'ds-msg-' + (chat.length - 1) : '' });
    },
    showInputBar(show) {
      if (!show && this.data.emojiPanelOpen) {
        this.setData({ emojiPanelOpen: false });
      }
    }
  },

  methods: {
    /* ===== 输入：草稿 / 发送态 / 光标 ===== */
    onDraftInput(e) {
      const value = e.detail.value || '';
      const cursor = typeof e.detail.cursor === 'number' ? e.detail.cursor : value.length;
      this.setData({ draft: value, canSend: value.trim().length > 0, cursor });
    },
    onDraftBlur(e) {
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
      this.setData({
        chat: chat,
        toView: 'ds-msg-' + (chat.length - 1)
      });
    },

    // 发送：空内容禁止；追加到聊天流，清空草稿/复位发送态/光标并关闭表情面板，滚动到底
    onSend() {
      const text = (this.data.draft || '').trim();
      if (!text) return;
      this._userTouched = true;
      const mentions = (this.data.mentions || []).slice();
      const chat = this.data.chat.concat({
        self: true,
        userId: 'me',
        name: '我',
        avatar: this.properties.selfAvatar,
        text,
        mention: '',
        mentions
      });
      this.setData({
        chat,
        toView: 'ds-msg-' + (chat.length - 1),
        draft: '',
        canSend: false,
        cursor: 0,
        emojiPanelOpen: false,
        mentions: []
      });
      this.triggerEvent('send', { text, mentions });
    },

    /* ===== @提及：长按头像（≥500ms）触发，与点击互不冲突 ===== */
    onAvatarTouchStart(e) {
      const ds = e.currentTarget.dataset || {};
      this._longPressed = false;
      if (this._lpTimer) clearTimeout(this._lpTimer);
      // 自实现 500ms 长按计时；touchmove/touchend 提前结束则视为普通点击。
      // 微信式即时注入：长按达成后「直接」插入 @用户名，不弹任何菜单/确认。
      this._lpTimer = setTimeout(() => {
        this._lpTimer = null;
        this._longPressed = true;
        this.insertMention(ds.userid, ds.name);
      }, 500);
    },
    onAvatarTouchMove() {
      if (this._lpTimer) {
        clearTimeout(this._lpTimer);
        this._lpTimer = null;
      }
    },
    onAvatarTouchEnd(e) {
      if (this._lpTimer) {
        clearTimeout(this._lpTimer);
        this._lpTimer = null;
      }
      // 短按：仅聊天发言头像上抛给宿主；组件内不打开弹窗（长按仍只做 @）
      if (this._longPressed) return;
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
      if (ds.role !== 'chat') return;
      const userId = ds.userid != null ? String(ds.userid).trim() : '';
      const name = ds.name != null ? String(ds.name).trim() : '';
      const avatar = ds.avatar != null ? String(ds.avatar) : '';
      const index = ds.index;
      const payload = {
        userId: userId,
        avatar: avatar,
        name: name,
        index: index,
        avatarRect: null
      };
      const sel =
        index != null && index !== ''
          ? '#ds-msg-avatar-' + index
          : '';
      if (!sel) {
        this.triggerEvent('playerAvatarTap', payload);
        return;
      }
      const self = this;
      this.createSelectorQuery()
        .in(this)
        .select(sel)
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

    // 在光标位置插入「@用户名 」，生成 mention 数据结构，保持输入框聚焦（支持多次 @）
    insertMention(userId, userName) {
      const name = userName || '';
      if (!name) return;
      const token = '@' + name + ' ';
      const draft = this.data.draft || '';
      const len = draft.length;
      let pos = typeof this.data.cursor === 'number' ? this.data.cursor : len;
      if (pos < 0 || pos > len) pos = len;
      const next = draft.slice(0, pos) + token + draft.slice(pos);
      const mention = { userId: userId || name, userName: name, displayText: '@' + name };
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
