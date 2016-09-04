if(!window.beamExtractor) {

    (function() {

      var BeamExtractor = {

        'counter' : 0,
        'counterInterval' : undefined,

        initialize : function() {

            var self = this;

            self.setupCounter();

            document.addEventListener('visibilitychange', function() {

                self.setupCounter();

            }, false);
        },

        setupCounter : function() {

            if(document.hidden) {

                if(this.counterInterval !== undefined)
                    clearInterval(this.counterInterval);

                this.counter = 0;

            } else {

                var self = this;

                this.counterInterval = setInterval(function() { 
                    self.counter++; 
                }, 1000);
            }
        },

        extract : function(payload) {

            var url = document.location.href;

            // Check if it is a Youtube url
            var youtubeMatches = url.match(/watch\?v=([a-zA-Z0-9\-_]+)/);

            if(youtubeMatches) {

                var currentTimestamp = parseInt(document.querySelectorAll('[aria-label="Seek slider"]')[0].getAttribute('aria-valuenow'));

                if(currentTimestamp)
                    url += '&t=' + currentTimestamp;
            }

            // TODO: Deal with the scroll position here and store it inside the Beam packet

            var dictionary = {
                'kind'  : 'extracted', 
                'url'   : url,
                'title' : document.title          
            };

            if(payload != undefined) {

                dictionary['counter'] = this.counter;
                dictionary['payload'] = payload;
            }

            chrome.runtime.sendMessage(dictionary);
        }
      };

      window.beamExtractor = BeamExtractor;

    })(window);

    beamExtractor.initialize();

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {

        if (message.type == 'extract') {

            beamExtractor.extract(message.payload);
            return true;
        }

        return false;
    });
}