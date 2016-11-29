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

          this.setupChunkedListener();

          chrome.browserAction.setBadgeBackgroundColor({ 'color' : '#5D00FF' });

          this.updateBadge();
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
      this.xhr.onprogress =  () => {  onChunk();  };
      this.xhr.onload = () => {  onChunk(true); };
      this.xhr.onerror = (error) => { this.retryChunckedConnection(); };
      this.xhr.send();
    },

    retryChunckedConnection() {

      this.xhr.abort();

      setTimeout(() => {

        this.setupChunkedListener();

      }, 1000);
    },

    sendChunkedRequest : function(object) {

      var urlEncoded = encodeURIComponent(JSON.stringify(object));

      var xhr = new XMLHttpRequest();
      xhr.open("POST", this.queueService + this.channelId + "/?json=" + urlEncoded, true);
      xhr.send();
    },

    parseChunkedResponse : function(chunk) {

      var response = JSON.parse(JSON.parse(chunk).values.json[0]);

      if(response.type == 'pushPacket')
        this.consumePushPacket(response.payload);
    },

    consumePushPacket : function(pushPacket) {

      if(pushPacket['recipient'] != this.getLocalDeviceName())
        return;

      chrome.tabs.create({ 'url' : pushPacket['url'] });                
    },

    sendPushPacket : function(url, recipient) {

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
      });

      chrome.storage.sync.get('show-notifications', (objects) => {

          if(objects['show-notifications'] === true) {

            chrome.notifications.create('', {
              'type'            : 'basic',
              'title'           : 'BeamTab',
              'message'         : 'Hey ' + this.getLocalDeviceName() + ', your tab was beamed to ' + recipient + '!',
              'iconUrl'         : '../icons/icon-128.png',
              'buttons'         : [{
                                    'title'   : 'Dismiss',
                                    'iconUrl' : '../icons/action_cancel.png'
                                  }]
            });
          }
      });
    }
  };

  window.BeamTab = BeamTab;

})(window);

BeamTab.initialize();

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {

  if(request.kind == 'extracted') {

    BeamTab.sendPushPacket(request.url, request.recipient);

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

    if(key == 'deviceList')
      BeamTab.syncRemoteDeviceList(BeamTab.changeDeviceCallback);
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

      // Do nothing if this is the only
      // registered device
      if(BeamTab.deviceList.length <= 1)
        return;

      chrome.tabs.executeScript(null, {
        file: "js/extractor.js",
        runAt: "document_end"
      }, function() {

        if (chrome.runtime.lastError)
          return;

        var singleRecipient = (BeamTab.deviceList.length == 2);
        var recipient = undefined;

        if(singleRecipient)
          recipient = BeamTab.getOtherDevicesList()[0];

        chrome.tabs.sendMessage(tabs[0].id, { 

          // Push the page immediately if we have only one
          // other registered device, otherwise present selector

          'type': (singleRecipient ? 'extract' : 'selector'),
          'recipient': recipient

        }, () => {

          if(chrome.runtime.lastError)
            console.log('Send message error: ', chrome.runtime.lastError);
        });

      });

      chrome.tabs.insertCSS(null, {
        file: "css/extractor.css",
        runAt: "document_end"
      });
  });
});