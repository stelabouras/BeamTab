(function() {

  var BeamTab = {

    xhr: null,
    pendingCallback: null,
    channelId : null,
    changeDeviceCallback : null,
    deviceList : [],
    friendList : [],
    notifications : {},

    queueHost     : 'https://queue.stavros.io',
    pushEndpoint  : '/push/',
    streamEndpoint: '/stream/',

    adjectives : [ 'content','pleased','cheerful','jovial','jolly','glad','thrilled','elated','gleeful','sunny', 'electrifying','exhilarating','delightful','sensational','animating','stimulating','vitalizing','overjoyed','euphoric','jubilant' ],
    nouns : [ 'octopus', 'hippo', 'horse', 'centaur', 'minotaur', 'unicorn', 'narwal', 'dodo', 'eagle', 'elf', 'bee', 'salamander', 'lion', 'eel', 'river', 'field', 'human' ],

    requests : {},

    initialize : function() {

      chrome.browserAction.setBadgeBackgroundColor({ 'color' : '#5D00FF' });

      this.syncRemotePreferences(() => {

        var localDeviceName = this.getLocalDeviceName();

        if(!localDeviceName)
          localDeviceName = this.generateDeviceName();

        this.updateDeviceListWithLocalDeviceName(localDeviceName);

        this.updateChannelId();

        this.checkForUndeliveredPackets();

        this.setupChunkedListener();

        this.updateBadge();

        this.updateContextMenus();
      });
    },

    addFriend : function(friendId, name, callback) {

      if(friendId == null) {

        callback && callback(false);
        return;
      }

      if(friendId == '') {

        callback && callback(false);
        return;
      }

      if(name == null) {

        callback && callback(false);
        return;
      }

      if(name == '') {

        callback && callback(false);
        return;
      }

      if(friendId.localeCompare(forge_sha256(this.channelId)) == 0) {

        callback && callback(false);
        return;
      }

      for(var index = 0; index < this.friendList.length; index++) {

        var friend = this.friendList[index];

        if(friendId.localeCompare(friend.id) == 0) {

          callback && callback(false);
          return;
        }
      }

      this.friendList.push({
        'id': friendId,
        'name': name
      });

      chrome.storage.sync.set({ 'friendList': this.friendList }, function() { callback && callback(true); });
    },

    removeFriend : function(friendId, callback) {

      if(friendId === undefined) {

        callback && callback(false);
        return;
      }

      var found = false;

      for(var index = 0; index < this.friendList.length; index++) {

        var friend = this.friendList[index];

        if(friendId.localeCompare(friend.id) == 0) {

          found = true;
          break;
        }
      }

      if(!found) {

        callback && callback(false);
        return;
      }

      this.friendList.splice(index, 1);

      chrome.storage.sync.set({ 'friendList': this.friendList }, function() { callback && callback(true); });
    },

    getFriendLink : function(callback) {

      chrome.identity.getProfileUserInfo((userInfo) => {

        if(!userInfo.email)
          return;

        if(userInfo.email == '')
          return;

        var extensionId = chrome.runtime.id;
        var username    = userInfo.email.split(/@/)[0];

        var link = 'chrome-extension://' + extensionId + '/html/options.html#invite=' + forge_sha256(this.channelId) + '|' + username;

        callback && callback(link);
      });
    },

    updateBadge : function() {

      chrome.storage.sync.get('show-badge', function(objects) {

        if(objects['show-badge'] === true) 
            chrome.browserAction.setBadgeText({ 'text' : '' + this.deviceList.length });
        else
            chrome.browserAction.setBadgeText({ 'text' : '' });

      }.bind(this));
    },

    generateDeviceName : function() {

      var generateRandomName = () => {

        var randomAdjective = this.adjectives[parseInt(Math.random() * this.adjectives.length)];
        var randomNoun = this.nouns[parseInt(Math.random() * this.nouns.length)];

        return randomAdjective + ' ' + randomNoun;

      };

      var randomName = generateRandomName();

      while(this.checkIfDeviceNameExists(randomName))
        randomName = generateRandomName();

      return randomName;
    },

    checkIfDeviceNameExists : function(name) {

      return (this.deviceList.indexOf(name) != -1);
    },

    deregisterDevice : function(deviceName, callback) {

      if(deviceName === undefined)
        return false;

      var deviceNameIndex = this.deviceList.indexOf(deviceName);

      if(deviceNameIndex == -1)
        return false;

      this.deviceList.splice(deviceNameIndex, 1);

      chrome.storage.sync.set({ 'deviceList': this.deviceList }, function() { callback && callback(); });
    },

    deregisterLocalDevice : function(updateStorageSync) {

      var localDeviceName = this.getLocalDeviceName();

      if(localDeviceName === undefined)
        return false;

      var deviceNameIndex = this.deviceList.indexOf(localDeviceName);

      if(deviceNameIndex == -1)
        return false;

      this.deviceList.splice(deviceNameIndex, 1);

      // Update remote device list
      if(updateStorageSync)
        chrome.storage.sync.set({ 'deviceList': this.deviceList });      

      localStorage.localDeviceName = undefined; 

      return true;
    },

    changeLocalDeviceName : function(newLocalDeviceName, callback) {

      // Check if name already exists in device list
      if(this.deviceList.indexOf(newLocalDeviceName) > -1)
        return false;

      var deregistered = this.deregisterLocalDevice(false);

      if(!deregistered)
        return false;

      // Push the new one
      this.updateDeviceListWithLocalDeviceName(newLocalDeviceName, callback);

      return true;
    },

    getLocalDeviceName : function() {

      if(localStorage.localDeviceName == 'undefined')
        return undefined;

      return localStorage.localDeviceName;
    },

    generateChannelId: function(channelIdLength) {

      var text = "";
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

      for( var i=0; i < channelIdLength; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

      return text;
    },

    updateDeviceListWithLocalDeviceName : function(localDeviceName, callback) {

      localStorage.localDeviceName = localDeviceName;

      if(this.deviceList.indexOf(localDeviceName) == -1)
        this.deviceList.push(localDeviceName);

      // Update remote device list
      chrome.storage.sync.set({ 'deviceList': this.deviceList }, function() { 

        if(callback)
          callback(); 
      });
    },

    updateChannelId : function() {

      if(this.channelId == null)
        return;

      chrome.storage.sync.set({ 'channelId': this.channelId});
    },

    syncRemotePreferences : function(callback) {

      // Fetch the remote device list, if exists
      chrome.storage.sync.get((items) => {

        this.deviceList = [];

        if(items['deviceList']) {

          var deviceList = items['deviceList'];

          for(var i = 0; i < deviceList.length; i++) {

            var value = deviceList[i];

            if(value == 'undefined')
              continue;

            if(value == null)
              continue;

            if(deviceList.indexOf(value) == i)
              this.deviceList.push(value);
          }
        }

        this.friendList = [];

        if(items['friendList'])
          this.friendList = items['friendList'];

        if(items['channelId'])
          this.channelId = items['channelId'];
        else
          this.channelId = this.generateChannelId(32);

        callback && callback();
      });
    },
  
    getOtherDevicesAndFriendsList : function() {

      var otherDevicesAndFriends = [];

      this.deviceList.forEach((deviceName) => {

        if(this.getLocalDeviceName().localeCompare(deviceName) == 0)
          return;

        otherDevicesAndFriends.push({
          'name': deviceName,
          'id': deviceName,
          'friend': false
        });
      });

      this.friendList.forEach((friend) => {

        otherDevicesAndFriends.push({
          'name': friend.name,
          'id': friend.id,
          'friend': true
        });
      });

      return otherDevicesAndFriends;
    },

    setupChunkedListener : function() {

      if(this.channelId == undefined)
        return;

      var offset = 0,
        token = '\n',
        onChunk = (finalChunk) => {

          if(this.xhr == null)
            return;

          var text = this.xhr.responseText;

          var chunk = text.substring(offset),
            start = 0,
            finish = chunk.indexOf(token, start),
            subChunk;

          if (finish === 0) { // The delimiter is at the beginning so move the start
            start = finish + token.length;
          }

          while ((finish = chunk.indexOf(token, start)) > -1) {
            subChunk = chunk.substring(start, finish);
            if (subChunk)
              this.parseChunkedResponse(subChunk);
            start = finish + token.length; // move the start
          }
          offset += start; // move the offset

          // Get the remaning chunk
          chunk = text.substring(offset);
          // If final chunk and still unprocessed chunk and no delimiter, then execute the full chunk
          if (finalChunk && chunk && finish === -1)
            this.parseChunkedResponse(chunk);
      };

      this.xhr = new XMLHttpRequest();
      this.xhr.open("GET", this.queueHost + this.streamEndpoint + this.channelId + "/?streaming=1", true);
      this.xhr.onprogress =  () => { onChunk();  };
      this.xhr.onload = () => { onChunk(true); };
      this.xhr.onerror = (error) => { this.retryChunckedConnection(); };
      this.xhr.send();
    },

    retryChunckedConnection() {

      this.xhr.abort();

      setTimeout(() => {

        this.checkForUndeliveredPackets();

        this.setupChunkedListener();

      }, 1000);
    },

    sendChunkedRequest : function(endpoint, channelId, object, successCallback) {

      var urlEncoded = encodeURIComponent(JSON.stringify(object));

      var xhr = new XMLHttpRequest();
      xhr.open("POST", this.queueHost + endpoint + channelId + "/?json=" + urlEncoded, true);
      xhr.onreadystatechange = (event) => {

        if(successCallback && event.target.readyState == 4 && event.target.status == 200)
          successCallback();
      };
      xhr.send();
    },

    parseChunkedResponse : function(chunk) {

      var chunkObj = JSON.parse(chunk);
      var response = JSON.parse(chunkObj.values.json[0]);

      if(response.type == 'pushPacket')
        this.consumePushPacket(response.payload, chunkObj.created);
    },

    checkForUndeliveredPackets : function() {

      var xhr = new XMLHttpRequest();
      xhr.open("GET", this.queueHost + this.streamEndpoint + this.channelId + "/?latest=20", true);
      xhr.onreadystatechange = (event) => {

        if(event.target.readyState == 4 && event.target.status == 200) {

          var responseText = event.target.responseText;

          if(responseText == undefined)
            return;

          var responseJSON = JSON.parse(responseText);

          if(responseJSON.messages == undefined)
            return;

          if(responseJSON.messages.length == 0)
            return;

          var lastConsumedMessageDT = new Date(localStorage.lastConsumedMessageTS);

          responseJSON.messages.forEach((object) => {

            var createdDt = new Date(object.created);

            if(localStorage.lastConsumedMessageTS != undefined && createdDt <= lastConsumedMessageDT)
              return;

            var pushPacket = JSON.parse(object.values.json[0]);

            this.consumePushPacket(pushPacket.payload, object.created);
          });
        }
      };
      xhr.send();
    },

    consumePushPacket : function(pushPacket, created) {

      if(pushPacket['friend'] == false && pushPacket['recipient'] != this.getLocalDeviceName())
        return;

      if(created)
        localStorage.lastConsumedMessageTS = created; 

      if(pushPacket['friend'] == true) {

        chrome.notifications.create({
          'type'              : 'basic',
          'requireInteraction': true,
          'title'             : 'BeamTab',
          'message'           : 'Your friend ' + pushPacket['name'] + ' beamed the following url to you:',
          'contextMessage'    : pushPacket['url'],
          'iconUrl'           : '../icons/icon-128.png',
          'buttons'           : [
                                { 'title'   : '👽 Take me there!' },
                                { 'title'   : '✖️ Dismiss' }
                                ]
        }, (notificationId) => { this.notifications[notificationId] = pushPacket['url']; });
      }
      else
        chrome.tabs.create({ 'url' : pushPacket['url'] });                
    },

    sendPushPacket : function(url, recipient, originatedFromContextMenu, tab) {

      if(!url)
        return;
     
      if(!recipient)
        return;

      var callback = () => {

        chrome.storage.sync.get('close-tab', (objects) => {

          if(objects['close-tab'] === true)
            chrome.tabs.remove(tab.id);
        });

        chrome.storage.sync.get('suppress-notifications', (objects) => {

            if(objects['suppress-notifications'] !== true) {

              chrome.notifications.create('', {
                'type'            : 'basic',
                'title'           : 'BeamTab',
                'message'         : 'Hey ' + this.capitalize(this.getLocalDeviceName()) + ', your ' + (originatedFromContextMenu ? 'link' : 'tab') + ' was beamed to ' + this.capitalize(recipient.name) + '!',
                'iconUrl'         : '../icons/icon-128.png',
                'buttons'         : [{ 'title'   : '✖️ Dismiss' }]
              });
            }
        });
      };

      var pushPacket = {
        'recipient' : recipient.id,
        'friend'    : recipient.friend,
        'url'       : url
      };

      if(recipient.friend) {

        chrome.identity.getProfileUserInfo((userInfo) => {

          if(!userInfo.email)
            return;

          if(userInfo.email == '')
            return;

          pushPacket.name = userInfo.email.split(/@/)[0];


          this.sendChunkedRequest(this.pushEndpoint, recipient.id, {
            'type' : 'pushPacket',
            'payload': pushPacket                
          }, callback);
        });
      }
      else
        this.sendChunkedRequest(this.streamEndpoint, this.channelId, {
          'type' : 'pushPacket',
          'payload': pushPacket                
        }, callback);
    },

    capitalize: function(str) {
      return str.toLowerCase().replace( /(^|\s)([a-z])/g , function(m,p1,p2){ return p1+p2.toUpperCase(); } );
    },

    updateContextMenus : function() {

      chrome.contextMenus.removeAll();

      var contexts = ["link", "page"];

      chrome.contextMenus.create({
        'title': 'Beam to...',
        'id': 'parent',
        'contexts': contexts
      });

      var otherDevicesAndFriendsList = this.getOtherDevicesAndFriendsList();

      if(otherDevicesAndFriendsList.length == 0) {

        chrome.contextMenus.create({
          'title': 'No devices found',
          'contexts': contexts,
          'parentId': 'parent',
        });
      }

      otherDevicesAndFriendsList.forEach((device) => {

        if(!device)
          return;

        if(!device.name)
          return;

        chrome.contextMenus.create({
          'title': device.name,
          'contexts': contexts,
          'parentId': 'parent',
          'onclick': (info, tab) => { 

            this.contextMenusClickHandler(info, device, tab); 
          }
        });
      });
    },

    contextMenusClickHandler : function(reference, recipient, tab) {

      if(recipient == undefined)
        return;

      var url = undefined;

      if(reference.linkUrl)
        url = reference.linkUrl;
      else if(reference.pageUrl)
        url = reference.pageUrl;

      if(url == undefined)
        return;

      this.sendPushPacket(url, recipient, true, tab);
    }
  };

  window.BeamTab = BeamTab;

})(window);

BeamTab.initialize();

chrome.idle.onStateChanged.addListener(function(state) {

  if(state == 'active')
    BeamTab.retryChunckedConnection();
});

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {

  if(request.kind == 'extracted') {
      
    BeamTab.sendPushPacket(request.url, request.recipient, false, sender.tab);

    sendResponse();
            
    return true;
  }
  else if(request.kind == 'other_devices_friends') {

    sendResponse(BeamTab.getOtherDevicesAndFriendsList());

    return true;
  }

  return false;
});

chrome.storage.onChanged.addListener(function (changes, namespace) {

  if(namespace != 'sync')
    return;

  if(!changes)
    return;
  
  for(key in changes) {

    if(key == 'deviceList' || key == 'friendList') {

      BeamTab.syncRemotePreferences(() => {

        if(BeamTab.changeDeviceCallback)
          BeamTab.changeDeviceCallback();

        BeamTab.updateContextMenus();
      });
    }
    else if(key == 'channelId')
      BeamTab.channelId = changes[key].newValue;
  }
});

chrome.notifications.onButtonClicked.addListener(function(notifId, btnIdx) {

  if(BeamTab.notifications[notifId]) {

    if(btnIdx == 0)
        chrome.tabs.create({ 'url' : BeamTab.notifications[notifId] });     

    delete BeamTab.notifications[notifId];
  }

  chrome.notifications.clear(notifId, () => { });
});

chrome.browserAction.onClicked.addListener(function() { 

  if (!window.chrome)
    return;

  chrome.tabs.query(
  { 
    'active': true, 
    'lastFocusedWindow': true 
  }, 
    function(tabs) {

      if(!tabs)
        return;

      if(tabs.length == 0)
        return;

      if(!tabs[0].url)
        return;

      chrome.tabs.executeScript(null, {
        file: "js/extractor.js",
        runAt: "document_end"
      }, function() {

        if (chrome.runtime.lastError)
          return;

        chrome.tabs.sendMessage(tabs[0].id, { 
          'type': 'selector'
        }, () => {

          if(chrome.runtime.lastError)
            console.log('Send message error: ', chrome.runtime.lastError);
        });

      });

      chrome.tabs.insertCSS(null, {
        file: "css/extractor.css",
        runAt: "document_end"
      }, function() {

        if(chrome.runtime.lastError)
          return;

      });
  });
});