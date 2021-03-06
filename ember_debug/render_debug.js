import PortMixin from "mixins/port_mixin";
import ProfileManager from 'models/profile_manager';

var K = Ember.K;
var addArrayObserver = Ember.addArrayObserver;
var computed = Ember.computed;
var oneWay = computed.oneWay;
var later = Ember.run.later;

var profileManager = new ProfileManager();

var queue = [];

function push(info) {
  var index = queue.push(info);
  if (1 === index) {
    later(flush, 50);
  }
  return index - 1;
}

function flush() {
  var entry, ended, i;
  for (i = 0; i < queue.length; i++) {
    entry = queue[i];
    if (entry.type === 'began') {
      queue[entry.endedIndex].profileNode = profileManager.began(entry.timestamp, entry.payload, entry.now);
    } else {
      profileManager.ended(entry.timestamp, entry.payload, entry.profileNode);
    }

  }
  queue.length = 0;
}

Ember.subscribe("render", {
  before: function(name, timestamp, payload) {
    var info = {
      type: 'began',
      timestamp: timestamp,
      payload: payload,
      now: Date.now()
    };
    return push(info);
  },

  after: function(name, timestamp, payload, beganIndex) {
    var endedInfo = {
      type: 'ended',
      timestamp: timestamp,
      payload: payload
    };

    var index = push(endedInfo);
    queue[beganIndex].endedIndex = index;
  }
});

export default Ember.Object.extend(PortMixin, {
  namespace: null,
  port: oneWay('namespace.port').readOnly(),
  application: oneWay('namespace.application').readOnly(),
  viewDebug: oneWay('namespace.viewDebug').readOnly(),
  portNamespace: 'render',

  profileManager: profileManager,

  init: function() {
    this._super();
    this._subscribeForViewTrees();
  },

  willDestroy: function() {
    this._super();
    this.profileManager.offProfilesAdded(this, this.sendAdded);
    this.profileManager.offProfilesAdded(this, this._updateViewTree);
  },

  _subscribeForViewTrees: function() {
    this.profileManager.onProfilesAdded(this, this._updateViewTree);
  },

  _updateViewTree: function(profiles) {
    var viewDurations = {};
    this._flatten(profiles).forEach(function(node) {
      if (node.viewGuid) {
        viewDurations[node.viewGuid] = node.duration;
      }
    });
    this.get('viewDebug').updateDurations(viewDurations);
  },

  _flatten: function(profiles, array) {
    var self = this;
    array = array || [];
    profiles.forEach(function(profile) {
      array.push(profile);
      self._flatten(profile.children, array);
    });
    return array;
  },

  sendAdded: function(profiles) {
    this.sendMessage('profilesAdded', { profiles: profiles });
  },

  messages: {
    watchProfiles: function() {
      this.sendMessage('profilesAdded', { profiles: this.profileManager.profiles });
      this.profileManager.onProfilesAdded(this, this.sendAdded);
    },

    releaseProfiles: function() {
      this.profileManager.offProfilesAdded(this, this.sendAdded);
    },

    clear: function() {
      this.profileManager.clearProfiles();
      this.sendMessage('profilesUpdated', {profiles: []});
    }
  }
});
