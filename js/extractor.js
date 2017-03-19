if(!window.beamExtractor) {

    (function() {

      var BeamExtractor = {

        isShown : false,

        extract : function(recipient) {

            var url = document.location.href;

            var urlParts = url.replace(/(>|<)/gi,'').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/|\&|\#)/);

            if(urlParts == null)
                return url;

            if(urlParts.length < 3)
                return url;

            // Check if we are on the YouTube domain
            var isYoutubeDomain = false;

            if(urlParts[0].includes('youtube.com') || urlParts[0].includes('youtu.be'))
                isYoutubeDomain = true;
            else if(urlParts[1].includes('youtube.com') || urlParts[1].includes('youtu.be'))
                isYoutubeDomain = true;

            if(!isYoutubeDomain)
                return url;

            var playlistElement = document.querySelector('[data-list-title]');

            if(playlistElement)
                return url;

            var videoId = document.querySelector('[data-video-id]').dataset.videoId;
            var currentTimestamp = parseInt(document.querySelector('[aria-label="Seek slider"]').getAttribute('aria-valuenow'));

            if(!videoId)
                return url;

            url = 'https://www.youtube.com/watch?v=' + videoId;

            if(currentTimestamp)
                url += '&t=' + currentTimestamp;

            return url;
        },

        presentSelector : function() {

            if(this.isShown)
                return;

            this.isShown = true;

            document.addEventListener('keyup', this.keyboardShortcuts.bind(this), false);

            this.messageBG = document.createElement('div');
            this.messageBG.className = 'bt-injected-message-bg';
            this.messageBG.addEventListener('click', (event) => {

                event.stopPropagation();

                this.hideSelector();

            }, false);

            document.body.insertBefore(this.messageBG, document.body.firstChild);

            const shadowRoot = this.messageBG.attachShadow({mode: 'open'});

            var stylesheet = document.createElement('link');
            stylesheet.setAttribute('rel', 'stylesheet');
            stylesheet.setAttribute('href', chrome.extension.getURL('css/extractor.css'));
            stylesheet.onload = () => {

                this.overlay = document.createElement('div');
                this.overlay.className = 'bt-injected-overlay';
                this.overlay.addEventListener('click', (event) => { event.stopPropagation(); }, false);

                shadowRoot.appendChild(this.overlay); 

                this.overlayHeader = document.createElement('div');
                this.overlayHeader.innerHTML = 'Beam to';
                this.overlay.appendChild(this.overlayHeader);

                var closeOverlay = document.createElement('a');
                closeOverlay.innerHTML = '<svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" style="pointer-events: none; display: block; width: 100%; height: 100%;"><g><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></g></svg>';
                closeOverlay.addEventListener('click', () => { this.hideSelector(); }, false);
                this.overlayHeader.appendChild(closeOverlay);


                var ul = document.createElement('ul');
                var self = this;

                chrome.runtime.sendMessage({ 'kind': 'other_devices_friends'}, (otherDevices) => {

                    if(otherDevices.length == 0) {

                        var li = document.createElement('li');
                        li.className = 'bt-injected-device no-devices';
                        li.innerHTML = 'No devices found.';
                        ul.appendChild(li);
                    }

                    otherDevices.forEach((device) => {

                        var li = document.createElement('li');
                        li.className = 'bt-injected-device';

                        var a = document.createElement('a');
                        a.setAttribute('style', 'cursor:pointer;');
                        a.setAttribute('data-id', device.id);
                        a.setAttribute('data-name', device.name);
                        a.setAttribute('data-friend', device.friend);
                        a.textContent = device.name;
                        a.addEventListener('click', function() {

                            var id = this.getAttribute('data-id');
                            var name = this.getAttribute('data-name');
                            var isFriend = (this.getAttribute('data-friend') == "true");

                            var recipient = {
                              'id': id,
                              'name': name,
                              'friend': isFriend
                            };

                            var url = self.extract(recipient);

                            chrome.runtime.sendMessage({
                                'kind'      : 'extracted', 
                                'url'       : url,
                                'recipient' : recipient    
                            });

                            self.hideSelector();

                        }, false);
                        li.appendChild(a);

                        if(device.friend) {
                            
                            var em = document.createElement('em')
                            em.textContent = 'Friend';
                            a.appendChild(em);
                        }

                        ul.appendChild(li);
                    });
                });

                this.overlay.appendChild(ul);
            };

            shadowRoot.appendChild(stylesheet);
        },

        hideSelector : function() {

            if(this.isShown === false)
                return;

            this.isShown = false;

            document.removeEventListener('keyup', this.keyboardShortcuts.bind(this), false);

            document.body.removeChild(this.messageBG);
        },

        keyboardShortcuts : function(event) {

            if(event.keyCode == 27) { //escape

                this.hideSelector();

            } else if(event.keyCode == 40) { //down

            } else if(event.keyCode == 38) { //up

            } else if(event.keyCode == 13) { //enter

            }
        },
      };

      window.beamExtractor = BeamExtractor;

    })(window);

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {

        if(message.type == 'selector') {

            beamExtractor.presentSelector();

            sendResponse();
            
            return true;
        }

        return false;
    });
}