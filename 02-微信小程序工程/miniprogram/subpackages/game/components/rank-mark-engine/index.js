var project = require('../../utils/rankMarkProjection.js');

Component({
  properties: {
    input: { type: Object, value: null }
  },
  observers: {
    input: function (input) {
      this._emit(input);
    }
  },
  lifetimes: {
    attached: function () {
      this._emit(this.properties.input);
    }
  },
  methods: {
    _emit: function (input) {
      var matchId = input && input.matchId != null ? String(input.matchId) : '';
      var groupId = input && input.groupId != null ? String(input.groupId) : '';
      try {
        var projection = project.project(input || {});
        this.triggerEvent('rankmarkchange', {
          ok: true,
          matchId: matchId,
          groupId: groupId,
          projection: projection || {}
        });
      } catch (e) {
        this.triggerEvent('rankmarkchange', {
          ok: false,
          matchId: matchId,
          groupId: groupId,
          projection: {}
        });
      }
    }
  }
});
