(function() {

  var OptionsOverlay = {

    container             : null,
    closeContainerButton  : null,
    actionContainerButton : null,
    overlayBody           : null,
    overlayHeader         : null,
    input                 : null,
    containerIsOpened     : false,

    initialize : function() {

      this.container = document.getElementById('overlay');
      this.closeContainerButton = document.getElementById('overlay-close');
      this.actionContainerButton= document.getElementById('overlay-action');
      this.overlayHeader = document.getElementById('overlay-header');
      this.overlayBody = document.getElementById('overlay-body');

      if(this.closeContainerButton)
        this.closeContainerButton.addEventListener('click', function() { this.close(); }.bind(this), false);

      window.addEventListener('keydown', function(event) {

        if(event.keyCode != 27)
          return;

        if(!this.containerIsOpened)
          return;

        this.containerIsOpened = false;
        this.container.style.display = '';

      }.bind(this), false);
    },

    open : function(header, body, focusInput, actionCallback) {

      this.containerIsOpened = true;

      this.container.style.display = 'block';

      this.overlayHeader.innerHTML = header;
      this.overlayBody.innerHTML = body;

      if(focusInput) {

        this.input = document.querySelector('#overlay input');

        if(this.input) {

          this.input.addEventListener('focus', function(e) {

            this.setSelectionRange(0, this.value.length);

            var copied = false;

            try {

              copied = document.execCommand('copy');

            } catch(err) {}

            e.stopPropagation();

          }, false);
        }
      }

      if(actionCallback) {

        this.actionContainerButton.style.display = 'inline-block';

        this.actionContainerButton.addEventListener('click', () => {

          actionCallback();

          this.close();

        }, false);
      }
    },

    close : function() {

      this.containerIsOpened = false;

      this.container.style.display = '';
    }
  };

  window.OptionsOverlay = OptionsOverlay;

})();

Options = new function() {

  var beamTabShortcut = document.getElementById('beamtab-key');
  var localDeviceName = document.getElementById('local-device-name');
  var checkboxes = document.querySelectorAll('input[type="checkbox"]');
  var beamTab;

  this.initialize = function() {

    window.addEventListener('focus', this.checkShortcuts.bind(this), false);

    localDeviceName.addEventListener('blur', this.changeName.bind(this), false);
    localDeviceName.addEventListener('keyup', function(event) {

      if(event.keyCode != 13)
        return;

      this.changeName();

    }.bind(this), false);

    this.checkShortcuts();

    for(var index = 0; index < checkboxes.length; index++) {

      var element = checkboxes[index];
      var elementId = element.id;

      chrome.storage.sync.get(elementId, function(object) {

        var keys = Object.keys(object);

          if(object[keys[0]] === true)
            document.getElementById(keys[0]).checked = true;
      });

      element.addEventListener('change', function() {

        var elementId = this.id;
        var checked = this.checked;

        var options = {};
        options[elementId] = checked;
        
        chrome.storage.sync.set(options);

        if(this.id == 'show-badge')
          beamTab.updateBadge();

      }, false);
    }

    chrome.runtime.getBackgroundPage(function(object) {

      beamTab  = object.BeamTab;

      window.addEventListener('hashchange', () => { this.parseHash(); });

      document.querySelector('#friend-link').addEventListener('click', () => {

        beamTab.getFriendLink((link) => {

          OptionsOverlay.open('Share your BeamTab link', '<p>This is your BeamTab link. Share it with your friends:</p><input value="' + link + '"/>', true);

        });
      });
      
      beamTab.changeDeviceCallback = function() { this.updateUI(); }.bind(this);

      this.updateUI();

      this.parseHash();

    }.bind(this));
  };

  this.parseHash = function() {

    var hash = location.hash;

    location.hash = '';

    if(hash.indexOf('#invite=') < 0)
      return;

    var invite = hash.split(/invite=/)[1];

    var friendId = invite.split(/\|/)[0];
    var friendName = invite.split(/\|/)[1];

    if(friendId == '')
      return;

    if(friendName == '')
      return;

    OptionsOverlay.open('Add a friend', '<p>Are you sure you want to add ' + friendName + ' in your friends list?</p>', false, () => {

      beamTab.addFriend(friendId, friendName, (added) => {

        this.updateFriendsList();
      });

    });
  }

  this.changeName = function() {

    var newName = localDeviceName.value;

    var changed = beamTab.changeLocalDeviceName(newName, function() { this.updateUI(); }.bind(this));

    if(!changed)
      localDeviceName.value = beamTab.getLocalDeviceName();
  };

  this.checkShortcuts = function() {

    chrome.commands.getAll(function(commands) {

      if(commands.length > 0 && commands[0].shortcut.length > 0) {

        var keys = commands[0].shortcut.split('+').join(' + ');
        beamTabShortcut.innerHTML = '<a id="open-keyboardshortcuts">' + keys + '</a>';
      }
      else
        beamTabShortcut.innerHTML = '<a id="open-keyboardshortcuts">Set Shortcut</a>';

      document.getElementById('open-keyboardshortcuts').addEventListener('click', function() { chrome.tabs.create({url:'chrome://extensions/?id=footer-section'}); }, false);
    });
  };

  this.updateDevicesList = function() {

    var devicesHTML = '';

    beamTab.deviceList.forEach(function(deviceName) {

      if(deviceName == undefined)
        return;

      if(beamTab.getLocalDeviceName() == undefined)
        return;

      if(deviceName == '')
        return;

      devicesHTML += '<li>';
      devicesHTML += deviceName;

      if(beamTab.getLocalDeviceName().localeCompare(deviceName) == 0)
        devicesHTML += '<em>This device</em>';
      else {
        devicesHTML += '<a class="remove" title="Remove device" data-recipient="' + deviceName + '">';
        devicesHTML += '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" style="pointer-events: none; display: block; width: 100%; height: 100%;"><g><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></g></svg>';
        devicesHTML += '</a>';
      }

      devicesHTML += '</li>';

    }.bind(this));

    document.getElementById('devices').innerHTML = devicesHTML;

    var self = this;
    var links = document.querySelectorAll('#devices a');

    for(var index = 0; index < links.length; index++) {

      links[index].addEventListener('click', function() {

        OptionsOverlay.open('Remove device', '<p>Are you sure you want to remove this device?</p>', false, () => {

          var recipient = this.getAttribute('data-recipient');

          beamTab.deregisterDevice(recipient, function() { self.updateDevicesList(); });
        });

      });
    }
  };

  this.updateFriendsList = function() {

    var friendsHTML = '';

    if(beamTab.friendList.length == 0)
      friendsHTML = '<li>No friends added yet</li>';
    else
      beamTab.friendList.forEach(function(friend) {

        if(friend == undefined)
          return;

        if(friend.id == '')
          return;

        if(friend.name == '')
          return;

        friendsHTML += '<li>';
        friendsHTML += friend.name;
        friendsHTML += '<a class="remove" title="Remove friend" data-friend="' + friend.id + '">';
        friendsHTML += '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" style="pointer-events: none; display: block; width: 100%; height: 100%;"><g><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></g></svg>';
        friendsHTML += '</a>';
        friendsHTML += '</li>';

      }.bind(this));

    document.getElementById('friends').innerHTML = friendsHTML;

    var self = this;
    var links = document.querySelectorAll('#friends a');

    for(var index = 0; index < links.length; index++) {

      links[index].addEventListener('click', function() {

        OptionsOverlay.open('Remove friend', '<p>Are you sure you want to remove this friend?</p>', false, () => {

          var friendId = this.getAttribute('data-friend');

          beamTab.removeFriend(friendId, function() { self.updateFriendsList(); });
        });

      });
    }
  };

  this.updateUI = function() {

    document.getElementById('local-device-name').value = beamTab.getLocalDeviceName();

    this.updateDevicesList();

    this.updateFriendsList();
  };
};

document.addEventListener('DOMContentLoaded', function () {

  OptionsOverlay.initialize();
  Options.initialize();

  window.beamTabOptions = Options;
});
