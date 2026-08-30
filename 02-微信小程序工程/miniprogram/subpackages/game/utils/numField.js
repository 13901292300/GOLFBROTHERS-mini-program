function onNumFocus(e) {
  const ds = e.currentTarget.dataset || {};
  this._numDidEdit = false;
  this.setData({
    numEditing: true,
    numEditList: ds.numList || '',
    numEditId: ds.id != null ? String(ds.id) : '',
    numEditField: ds.numField || ds.key || '',
    numEditDraft: ''
  });
}

function onNumInput(e) {
  let val = e.detail && e.detail.value != null ? String(e.detail.value) : '';
  const ds = e.currentTarget.dataset || {};
  if (ds.numInt === true || ds.numInt === 'true' || ds.numInt === 1 || ds.numInt === '1') {
    val = val.replace(/\D/g, '');
  }
  if (!this._numDidEdit && val === '') return;
  this._numDidEdit = true;
  this.setData({ numEditDraft: val });
  const name = ds.numHandler;
  if (name && typeof this[name] === 'function') {
    this[name]({
      currentTarget: e.currentTarget,
      detail: { value: val }
    });
  }
}

function onNumBlur() {
  this._numDidEdit = false;
  this.setData({
    numEditing: false,
    numEditList: '',
    numEditId: '',
    numEditField: '',
    numEditDraft: ''
  });
}

module.exports = {
  onNumFocus: onNumFocus,
  onNumInput: onNumInput,
  onNumBlur: onNumBlur
};
