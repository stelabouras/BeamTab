if(!window.extractor) {

    (function() {

      var Extractor = {

        extract : function() {

            var url = document.location.href;

            // Check if it is a Youtube url
            var youtubeMatches = url.match(/watch\?v=([a-zA-Z0-9\-_]+)/);

            if(youtubeMatches) {

                var currentTimestamp = parseInt(document.querySelectorAll('[aria-label="Seek slider"]')[0].getAttribute('aria-valuenow'));

                if(currentTimestamp)
                    url += '&t=' + currentTimestamp;
            }

            // TODO: Deal with the scroll position here and store it inside the Beam packet

            chrome.runtime.sendMessage({ 
                'kind'  : 'extracted', 
                'url'   : url
            });
        }
      };

      window.extractor = Extractor;

    })(window);

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {

        if (message.type == 'extract') {

            extractor.extract();
            return true;
        }

        return false;
    });
}