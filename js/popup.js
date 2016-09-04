(function() {

	var BeamPopup = {

		beamTab: null,

		initialize : function(beamTab) {

			var self = this;

			this.beamTab = beamTab;

			var deviceList = this.beamTab.deviceList;
			var options    = document.getElementById('devices');

          	for(var i = 0; i < deviceList.length; i++) {

            	var deviceName = deviceList[i];

	            if(deviceName == 'undefined')
	              continue;

	            if(deviceName == null)
	              continue;

	          	if(deviceName == this.beamTab.getLocalDeviceName())
	          		continue;

				var li = document.createElement('li');
				var a = document.createElement('a');
				a.textContent = deviceName;
				a.setAttribute('href', 'javascript:void(0);');
				a.setAttribute('style', 'cursor:pointer;');
				a.setAttribute('data-recipient', deviceName);
				a.addEventListener('click', function() {
					self.sendTab(this.getAttribute('data-recipient'));                    
				}, false);
				li.appendChild(a);
				options.appendChild(li);
          	}

			this.beamTab.initiatePullRequest(function(pullPacket) {
				document.getElementById('recent-tab').innerHTML =  '<p>Latest tab</p><p><a href="' + pullPacket['url'] + '">' + pullPacket['title'] + '</a> -  <em>' + pullPacket['sender'] + '</em></p>';
			});
		},

		sendTab : function(recipient) {

			this.beamTab.initiatePushRequest(recipient);
		}
	};

	window.BeamPopup = BeamPopup;

})(window);

document.addEventListener('DOMContentLoaded', function() {

	chrome.runtime.getBackgroundPage(function(object) {

		BeamPopup.initialize(object.BeamTab);
	});

}, false);