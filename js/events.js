(function() {

  var BeamTab = {

    pubnub : null,
    channelId : null,
    deviceList : [],

    initialize : function() {

        var self = this;

        this.syncRemoteDeviceList(function() {

          if(!self.getLocalDeviceName()) {

            var localDeviceName = prompt("Enter a local device name:");

            while(!localDeviceName || self.deviceList.indexOf(localDeviceName) != -1) {

              var promptMessage = "This device name exists.";

              if(!localDeviceName)
                promptMessage = "You have to name your device first.";

              localDeviceName = prompt(promptMessage + "\nEnter a local device name:");
            }

            self.updateDeviceListWithLocalDeviceName(localDeviceName);
          }

          self.updateChannelId();
        });
    },

    generateChannelId: function(channelIdLength) {

      var text = "";
      var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

      for( var i=0; i < channelIdLength; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

      return text;
    },

    getLocalDeviceName : function() {

      return localStorage.localDeviceName;
    },

    updateDeviceListWithLocalDeviceName : function(localDeviceName) {

      localStorage.localDeviceName = localDeviceName;

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

      var self = this;

      this.pubnub = new PubNub({
          publishKey : 'pub-c-ab27c63c-7f84-488b-99eb-8b71e1cce6e4',
          subscribeKey : 'sub-c-e0924ba2-7212-11e6-b9ce-02ee2ddab7fe'
      });

      this.pubnub.addListener({
        status: function(statusEvent) {
          console.log('status', statusEvent);
        },
        message: function(message) {

          console.log('message', message);

          if(message.message.type == 'beamPacket')
           self.consumePacket(message.message.payload);
        },
        presence: function(presenceEvent) {
            console.log('presence', presenceEvent);
        }
      });

      this.pubnub.subscribe({
        channels: [this.channelId] 
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

              var value = items['deviceList'][i];

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
    Beam packet specs:

    {
      'recipientDeviceName' : 'xxxx',
      'urls'                : [
        'url1',
        'url2',
        'url3',
        ...
      ]
    }
    */
    consumePacket : function(beamPacket) {

      if(beamPacket['recipientDeviceName'] != this.getLocalDeviceName())
        return;

      if(!beamPacket['urls'])
        return;

      if(beamPacket['urls'].length == 0)
        return;

      console.log('Packet was received! Consuming...');

      var urls = beamPacket['urls'];

      for(index in urls)
         chrome.tabs.create({ 'url' : urls[index] });        
    },
    
    sendPacket : function(recipientDeviceName, urlList) {

      if(!recipientDeviceName)
        return;

      if(!urlList)
        return;

      if(urlList.length == 0)
        return;

      if(this.pubnub == null)
        return;

      var beamPacket = {
        'recipientDeviceName' : recipientDeviceName,
        'urls'                : urlList
      };

      var publishConfig = {
          channel : this.channelId,
          message : {
            'type' : 'beamPacket',
            'payload': beamPacket
          }
      };

      this.pubnub.publish(publishConfig, function(status, response) {
          console.log(status, response);
      });
    }
  };

  window.BeamTab = BeamTab;

})(window);

BeamTab.initialize();

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {

  if(request.kind == 'extracted') {

    if(BeamTab.deviceList.length == 2) {

      for(index in BeamTab.deviceList) {

        var deviceName = BeamTab.deviceList[index];

        if(deviceName == BeamTab.getLocalDeviceName())
          continue;

        BeamTab.sendPacket(deviceName, [ request.url ]);
      }
    }
    else
      alert('You have to select where to send it brah');

    return true;
  }

  return false;
});

chrome.browserAction.onClicked.addListener( function() { 

  if (window.chrome) {

    chrome.tabs.query({ 'active': true, 'lastFocusedWindow': true }, function(tabs) {

        if(!tabs)
          return;
        
        if(tabs.length == 0)
          return;

        if(!tabs[0].url)
          return;

        if(BeamTab.deviceList.length <= 1) {

          alert('No other devices registered yet!');
          return;
        }

        var tabId = tabs[0].id;

        chrome.tabs.executeScript(null, {
          file: "js/extractor.js",
          runAt: "document_end"
        }, function() {

          if (chrome.runtime.lastError) {

              alert(chrome.runtime.lastError.message);
              return;
          }        
        
          chrome.tabs.sendMessage(tabId, { 'type': 'extract' });
        });
    });
  }
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