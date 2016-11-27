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

      beamTab.changeDeviceCallback = function() { this.updateUI(); }.bind(this);

      this.updateUI();

    }.bind(this));
  };

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

  this.updateUI = function(authenticated) {

    document.getElementById('local-device-name').value = beamTab.getLocalDeviceName();

    var devicesHTML = '';

    beamTab.deviceList.forEach(function(deviceName) {

      if(deviceName == undefined)
        return;

      if(beamTab.getLocalDeviceName() == undefined)
        return;

      devicesHTML += '<li>';
      devicesHTML += deviceName;

      if(beamTab.getLocalDeviceName().localeCompare(deviceName) == 0)
        devicesHTML += '<em>This device!</em>';
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

        var confirmed = confirm("Are you sure you want to remove this device?");

        if(!confirmed)
          return;

        var recipient = this.getAttribute('data-recipient');

        beamTab.deregisterDevice(recipient, function() { self.updateUI(); });
      });
    }
  };
};

document.addEventListener('DOMContentLoaded', function () {

  Options.initialize();

  window.beamTabOptions = Options;
});
