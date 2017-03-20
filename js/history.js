History = new function() {

  var historyElement = null;
  var beamTab;

  this.initialize = () => {

    this.historyElement = document.querySelector('#history');

    chrome.runtime.getBackgroundPage((object) => {

      this.beamTab  = object.BeamTab;

      this.beamTab.getFriendHistory((friendMessages) => {

        if(friendMessages.length == 0)
          return;

        var html = '';

        friendMessages.forEach((message) => {

          var date = new Date(message.ts);

          html += '<li>';
          html += '<a target="_blank" href="' + message.url + '">' + decodeURIComponent(message.url) + '</a>';
          html += '<span>' + message.name + '</span>';
          html += '<em>' + this.timeDifference(date.getTime()) + '</em>';
          html += '</li>';
        });

        this.historyElement.innerHTML = html;
      });

    });
  };

  this.timeDifference = (timestamp) => {

    var msPerMinute = 60 * 1000;
    var msPerHour = msPerMinute * 60;
    var msPerDay = msPerHour * 24;
    var msPerMonth = msPerDay * 30;
    var msPerYear = msPerDay * 365;

    var now = new Date();
    var elapsed = now.getTime() - timestamp;

    if (elapsed < msPerMinute) {
         return Math.round(elapsed/1000) + ' seconds ago';   
    }

    else if (elapsed < msPerHour) {
         return Math.round(elapsed/msPerMinute) + ' minutes ago';   
    }

    else if (elapsed < msPerDay ) {
         return Math.round(elapsed/msPerHour ) + ' hours ago';   
    }

    else if (elapsed < msPerMonth) {
        return 'approximately ' + Math.round(elapsed/msPerDay) + ' days ago';   
    }

    else if (elapsed < msPerYear) {
        return 'approximately ' + Math.round(elapsed/msPerMonth) + ' months ago';   
    }

    else {
        return 'approximately ' + Math.round(elapsed/msPerYear ) + ' years ago';   
    }
}

};

document.addEventListener('DOMContentLoaded', () => {

  History.initialize();

});
