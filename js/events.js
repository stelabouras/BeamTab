(function() {

  var BeamTab = {

    xhr: null,
    pendingCallback: null,
    channelId : null,
    changeDeviceCallback : null,
    deviceList : [],

    queueService : 'https://queue.stavros.io/stream/',

    adjectives : [ 'content','pleased','cheerful','jovial','jolly','glad','thrilled','elated','gleeful','sunny', 'electrifying','exhilarating','delightful','sensational','animating','stimulating','vitalizing','overjoyed','euphoric','jubilant' ],
    nouns : [ 'octopus', 'hippo', 'horse', 'centaur', 'minotaur', 'unicorn', 'narwal', 'dodo', 'eagle', 'elf', 'bee', 'salamander', 'lion', 'eel', 'river', 'field', 'human' ],

    requests : {},

    initialize : function() {

        this.syncRemoteDeviceList(() => {

          var localDeviceName = this.getLocalDeviceName();

          if(!localDeviceName)
            localDeviceName = this.generateDeviceName();

          this.updateDeviceListWithLocalDeviceName(localDeviceName);

          this.updateChannelId();

          this.checkForUndeliveredPackets();

          this.setupChunkedListener();

          chrome.browserAction.setBadgeBackgroundColor({ 'color' : '#5D00FF' });

          this.updateBadge();

          this.updateContextMenus();
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

    syncRemoteDeviceList : function(callback) {

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

        if(items['channelId'])
          this.channelId = items['channelId'];
        else
          this.channelId = this.generateChannelId(10);

        callback && callback();
      });
    },
  
    getOtherDevicesList : function() {

      var otherDevices = [];

      this.deviceList.forEach((deviceName) => {

        if(this.getLocalDeviceName().localeCompare(deviceName) == 0)
          return;

        otherDevices.push(deviceName);
      });

      return otherDevices;
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
      this.xhr.open("GET", this.queueService + this.channelId + "/?streaming=1", true);
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

    sendChunkedRequest : function(object, successCallback) {

      var urlEncoded = encodeURIComponent(JSON.stringify(object));

      var xhr = new XMLHttpRequest();
      xhr.open("POST", this.queueService + this.channelId + "/?json=" + urlEncoded, true);
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
      xhr.open("GET", this.queueService + this.channelId + "/?latest=20", true);
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

      if(pushPacket['recipient'] != this.getLocalDeviceName())
        return;

      if(created)
        localStorage.lastConsumedMessageTS = created; 

      chrome.tabs.create({ 'url' : pushPacket['url'] });                
    },

    sendPushPacket : function(url, recipient, originatedFromContextMenu, tab) {

      if(!url)
        return;
     
      if(!recipient)
        return;

      var pushPacket = {
        'recipient' : recipient,
        'url'       : url
      };

      this.sendChunkedRequest({
        'type' : 'pushPacket',
        'payload': pushPacket        
      }, () => {

        chrome.storage.sync.get('close-tab', (objects) => {

          if(objects['close-tab'] === true)
            chrome.tabs.remove(tab.id);
        });

        chrome.storage.sync.get('suppress-notifications', (objects) => {

            if(objects['suppress-notifications'] !== true) {

              chrome.notifications.create('', {
                'type'            : 'basic',
                'title'           : 'BeamTab',
                'message'         : 'Hey ' + this.capitalize(this.getLocalDeviceName()) + ', your ' + (originatedFromContextMenu ? 'link' : 'tab') + ' was beamed to ' + this.capitalize(recipient) + '!',
                'iconUrl'         : '../icons/icon-128.png',
                'buttons'         : [{
                                      'title'   : 'Dismiss',
                                      'iconUrl' : '../icons/action_cancel.png'
                                    }]
              });
            }
        });

      });
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

      var otherDevicesList = this.getOtherDevicesList();

      if(otherDevicesList.length == 0) {

        chrome.contextMenus.create({
          'title': 'No devices found',
          'contexts': contexts,
          'parentId': 'parent',
        });
      }

      otherDevicesList.forEach((deviceName) => {

        chrome.contextMenus.create({
          'title': deviceName,
          'contexts': contexts,
          'parentId': 'parent',
          'onclick': (info, tab) => { this.contextMenusClickHandler(info, deviceName, tab); }
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
  else if(request.kind == 'other_devices') {

    sendResponse(BeamTab.getOtherDevicesList());

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

    if(key == 'deviceList') {

      BeamTab.syncRemoteDeviceList(() => {

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
    chrome.notifications.clear(notifId, function() {});
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
