var http = require('http');

var GoogleStock = function() {
	this.getXML = function(ticker, callback) {
		//console.log('Getting ticker data');
		var options = { host: 'www.google.com', path: '/ig/api?stock='+ticker, port: 80, method: 'GET' }
		var xml = '';
		var googleReq = http.request(options, function(googleRes) {
			googleRes.on('data', function(chunk) {
				xml += chunk
			});
			googleRes.on('end', function() {
				callback(xml);
			});
		}).on('error', function(e) {  
			console.log("Got error: " + e.message);   
		}); 
		googleReq.end();
	};
};

module.exports = GoogleStock;