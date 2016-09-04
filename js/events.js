(function() {

  var BeamTab = {

    pendingCallback: null,
    pendingRecipient: null,
    channelId : null,
    pullTimeout : null,
    deviceList : [],
    requests : {},

    initialize : function() {

        var self = this;

        this.syncRemoteDeviceList(function() {

          var localDeviceName = self.getLocalDeviceName();

          if(!localDeviceName) {

            localDeviceName = prompt("Enter a local device name:");

            while(!localDeviceName || self.deviceList.indexOf(localDeviceName) != -1) {

              var promptMessage = "This device name exists.";

              if(!localDeviceName)
                promptMessage = "You have to name your device first.";

              localDeviceName = prompt(promptMessage + "\nEnter a local device name:");
            }
          }

          self.updateDeviceListWithLocalDeviceName(localDeviceName);

          self.updateChannelId();

          self.setupChunkedListener();
        });
    },

    setupChunkedListener : function() {

      var offset = 0,
        token = '\n',
        self = this,
        onChunk = function(text, finalChunk) {
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
              self.parseChunkedResponse(subChunk);
            start = finish + token.length; // move the start
          }
          offset += start; // move the offset

          // Get the remaning chunk
          chunk = text.substring(offset);
          // If final chunk and still unprocessed chunk and no delimiter, then execute the full chunk
          if (finalChunk && chunk && finish === -1)
            self.parseChunkedResponse(chunk);
      };

      var xhr = new XMLHttpRequest();
      xhr.open("GET", "https://queue.stavros.io/stream/" + this.channelId + "/?streaming=1", true);
      xhr.onprogress = function () { onChunk(xhr.responseText); };
      xhr.onload = function() { onChunk(xhr.responseText, true); };
      xhr.send();
    },

    sendChunkedRequest : function(object) {

      var urlEncoded = encodeURIComponent(JSON.stringify(object));

      var xhr = new XMLHttpRequest();
      xhr.open("POST", "https://queue.stavros.io/stream/" + this.channelId + "/?json=" + urlEncoded, true);
      xhr.send();
    },

    parseChunkedResponse : function(chunk) {

      var response = JSON.parse(JSON.parse(chunk).values.json[0]);

      if(response.type == 'pushPacket')
        this.consumePushPacket(response.payload);
      else if(response.type == 'pullPacket')
        this.consumePullPacket(response.payload);
      else if(response.type == 'pullPacketRequest')
        this.consumePullPacketRequest(response.payload);
    },

    generateChannelId: function(channelIdLength) {

      var text = "";
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

      for( var i=0; i < channelIdLength; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

      return text;
    },

    getLocalDeviceName : function() {

      if(localStorage.localDeviceName == 'undefined')
        return undefined;

      return localStorage.localDeviceName;
    },

    updateDeviceListWithLocalDeviceName : function(localDeviceName) {

      localStorage.localDeviceName = localDeviceName;

      if(this.deviceList.indexOf(localDeviceName) == -1)
        this.deviceList.push(localDeviceName);

      // Update remote device list
      chrome.storage.sync.set({ 'deviceList': this.deviceList }, function() { 

        if(chrome.runtime.lastError)
          console.log('Error:', chrome.runtime.lastError);        
      });
    },

    updateChannelId : function() {

      if(this.channelId == null)
        return;

      chrome.storage.sync.set({ 'channelId': this.channelId}, function() {

        if(chrome.runtime.lastError)
          console.log('Error:', chrome.runtime.lastError);
      });
    },

    syncRemoteDeviceList : function(callback) {

      var self = this;

      // Fetch the remote device list, if exists
      chrome.storage.sync.get(function (items) {

        if(chrome.runtime.lastError)
          console.log('Error:', chrome.runtime.lastError);

        self.deviceList = [];

        if(items['deviceList']) {

          var deviceList = items['deviceList'];

          for(var i = 0; i < deviceList.length; i++) {

            var value = deviceList[i];

            if(value == 'undefined')
              continue;

            if(value == null)
              continue;

            if(deviceList.indexOf(value) == i)
              self.deviceList.push(value);
          }
        }

        if(items['channelId'])
          self.channelId = items['channelId'];
        else
          self.channelId = self.generateChannelId(10);

        callback && callback();
      });
    },

    /**
    Pull Packet specs:

    {
      'recipient' : recipient device name,
      'url': url,
    }
    */
    consumePushPacket : function(pushPacket) {

      if(pushPacket['recipient'] != this.getLocalDeviceName())
        return;

      chrome.tabs.create({ 'url' : pushPacket['url'] });                
    },

    /**
    Pull Packet specs:

    {
      'sender': sender device name,
      'recipient' : recipient device name,
      'id' : unique request id,
      'url': url,
      'title': url title,
      'counter': how fresh is the url (The higher, the more fresh)
    }
    */
    consumePullPacket : function(pullPacket) {

      if(pullPacket['sender'] == this.getLocalDeviceName())
        return;

      if(pullPacket['recipient'] != this.getLocalDeviceName())
        return;

      if(!pullPacket['id'])
        return;

      if(!this.requests[pullPacket['id']])
        this.requests[pullPacket['id']] = { 'senders': 1 };        
      else
        this.requests[pullPacket['id']].senders += 1;

      if(pullPacket['url'] && pullPacket['counter'] && !this.requests[pullPacket['id']].packet)
        this.requests[pullPacket['id']].packet = pullPacket;
      else if(pullPacket['url'] && pullPacket['counter'] && this.requests[pullPacket['id']].packet.counter > pullPacket['counter'])
        this.requests[pullPacket['id']].packet = pullPacket;

      // If all the requests are in, open the tab
      if(this.requests[pullPacket['id']].senders == this.deviceList.length - 1) {

        if(this.pendingCallback)
          this.pendingCallback(this.requests[pullPacket['id']].packet);

        delete this.requests[pullPacket['id']];

        return;
      }

      if(this.pullTimeout != null)
        return;

      var self = this;

      this.pullTimeout = setTimeout(function() {

        if(self.requests[pullPacket['id']].senders < self.deviceList.length - 1) {

          if(self.pendingCallback)
            self.pendingCallback(self.requests[pullPacket['id']].packet);

          delete self.requests[pullPacket['id']];
        }

        clearTimeout(self.pullTimeout);

      }, 200);
    },

    /**
    Pull Packet Request specs:

    {
      'sender': sender device name,
      'id': unique request id
    }
    */
    consumePullPacketRequest : function(pullPacketRequest) {

      if(!pullPacketRequest['sender'])
        return;

      if(pullPacketRequest['sender'] == this.getLocalDeviceName())
        return;

      if(!pullPacketRequest['id'])
        return;

      chrome.tabs.query({ 'active': true, 'lastFocusedWindow': true }, function(tabs) {

        if(!tabs)
          return;
        
        if(tabs.length == 0)
          return;

        if(!tabs[0].url)
          return;

        var tabId = tabs[0].id;

        chrome.tabs.sendMessage(tabId, { 
          'type': 'extract',
          'payload': pullPacketRequest
        });
      });
    },

    initiatePushRequest : function(recipient) {

      console.log('initiatePushRequest', recipient);

      if(recipient == undefined)
        return;

      this.pendingRecipient = recipient;

      chrome.tabs.query({ 'active': true, 'lastFocusedWindow': true }, function(tabs) {

        if(!tabs)
          return;
        
        if(tabs.length == 0)
          return;

        if(!tabs[0].url)
          return;

        var tabId = tabs[0].id;

        console.log('sending extract request');
        
        chrome.tabs.sendMessage(tabId, { 
          'type': 'extract'
        });
      });
    },

    initiatePullRequest : function(callback) {

      if(callback)
        this.pendingCallback = callback;

      if(this.deviceList.length <= 1) {

        alert('No other devices registered yet!');
        return;
      }

      if(this.pullTimeout != null)
        clearTimeout(this.pullTimeout);

      this.sendChunkedRequest({
        'type' : 'pullPacketRequest',
        'payload' : {
          'sender' : this.getLocalDeviceName(),
          'id': new Date().getTime()              
        }        
      });
    },

    sendPushPacket : function(url) {

      if(!url)
        return;
     
      var recipient = this.pendingRecipient;

      if(recipient == undefined)
        return;

      var pushPacket = {
        'recipient'           : recipient,
        'url'                 : url
      };

      this.sendChunkedRequest({
        'type' : 'pushPacket',
        'payload': pushPacket        
      });
    },

    sendPullPacket : function(pullPacketRequest, url, counter, title) {

      if(!pullPacketRequest['sender'])
        return;

      if(!pullPacketRequest['id'])
        return;

      if(!url)
        return;

      if(!counter)
        return;

      var pullPacket = {
        'sender'              : this.getLocalDeviceName(),
        'recipient'           : pullPacketRequest.sender,
        'id'                  : pullPacketRequest.id,
        'url'                 : url,
        'title'               : title,
        'counter'             : counter
      };

      this.sendChunkedRequest({
        'type' : 'pullPacket',
        'payload': pullPacket
      });
    }
  };

  window.BeamTab = BeamTab;

})(window);

BeamTab.initialize();

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {

  console.log(request);

  if(request.kind == 'extracted') {

    if(request.payload == undefined)
      BeamTab.sendPushPacket(request.url);
    else
      BeamTab.sendPullPacket(request.payload, request.url, request.counter, request.title);

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
      BeamTab.syncRemoteDeviceList();
    else if(key == 'channelId')
      BeamTab.channelId = changes[key].newValue;
  }
});