if(!window.beamExtractor) {

    (function() {

      var BeamExtractor = {

        isShown : false,

        extract : function(recipient) {

            var url = document.location.href;

            // Check if it is a Youtube url
            var youtubeMatches = url.match(/watch\?v=([a-zA-Z0-9\-_]+)/);

            if(youtubeMatches) {

                var youtubeUrl = document.querySelector('link[rel="shortlink"]').getAttribute('href');
                var currentTimestamp = parseInt(document.querySelector('[aria-label="Seek slider"]').getAttribute('aria-valuenow'));

                if(youtubeUrl) {

                    url = youtubeUrl;

                    if(currentTimestamp)
                        url += '?t=' + currentTimestamp;
                }
            }

            var dictionary = {
                'kind'      : 'extracted', 
                'url'       : url,
                'recipient' : recipient       
            };

            chrome.runtime.sendMessage(dictionary);
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

                chrome.runtime.sendMessage({ 'kind': 'other_devices'}, (otherDevices) => {

                    if(otherDevices.length == 0) {

                        var li = document.createElement('li');
                        li.className = 'bt-injected-device no-devices';
                        li.innerHTML = 'No devices found.';
                        ul.appendChild(li);
                    }

                    otherDevices.forEach((deviceName) => {

                        var li = document.createElement('li');
                        li.className = 'bt-injected-device';

                        var a = document.createElement('a');
                        a.setAttribute('style', 'cursor:pointer;');
                        a.setAttribute('data-recipient', deviceName);
                        a.textContent = deviceName;
                        a.addEventListener('click', function() {

                            var recipient = this.getAttribute('data-recipient');
                          
                            self.extract(recipient);

                            self.hideSelector();

                        }, false);
                        li.appendChild(a);

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