// Module dependencies
var express = require('express')
var routes = require('./routes');
var everyauth = require('everyauth');
var mongoose = require('mongoose');
var mongooseAuth = require('mongoose-auth');
var conf = require('./config/oauth_providers');
var Twit = require('twit');
var SocketIO = require('socket.io');
var xml2js = require('xml2js');
var http = require('http');
var GoogleStock = require('./modules/google_stock');
var util = require('util');

var Schema = mongoose.Schema;
var ObjectId = mongoose.SchemaTypes.ObjectId;
var UserSchema = new Schema({});
var User;
var googleStock = new GoogleStock();
var xmlParser = new xml2js.Parser();

var T = new Twit({
    consumer_key: conf.twit.consumerKey,
	consumer_secret: conf.twit.consumerSecret,
	access_token: conf.twit.accessToken,
	access_token_secret: conf.twit.accessTokenSecret
});

UserSchema.plugin(mongooseAuth, {
  everymodule: {
    everyauth: {
      User: function() {
        return User;
      }
    }
  },
  twitter: {
    everyauth: {
      myHostname: 'http://localhost:3000',
      consumerKey: conf.twit.consumerKey,
      consumerSecret: conf.twit.consumerSecret,
      redirectPath: '/'
    }
  }
});

mongoose.model('User', UserSchema);
mongoose.connect('mongodb://localhost/node-ticker'); 
User = mongoose.model('User');

var app = module.exports = express.createServer();
var io = SocketIO.listen(app);

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'my secret key :)' }));
  app.use(require('stylus').middleware({ src: __dirname + '/public' }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
  app.use(mongooseAuth.middleware());	
});

mongooseAuth.helpExpress(app);

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

io.sockets.on('connection', function (socket) {
	var stream = null;
	var timedStockCheck = null;
	socket.on('new-ticker', function (data) {
		//console.log(data);
		var stockXML = googleStock.getXML(data.ticker, function(xml){
			//console.log('XML arrived: '+xml);
			xmlParser.parseString(xml, function (err, result) {
				//console.log(util.inspect(result, false, null));
				if(result.finance.exchange['@'].data === 'UNKNOWN EXCHANGE') {
					socket.emit("unknown-ticker",{ ticker: data.ticker});
				}
				else {
					timedStockCheck = setInterval(function (){
							xmlParser.parseString(xml, function (err, result) {
								socket.emit("ticker-data-update",{ ticker_update: result.finance});
							});
						}, 2000);
					socket.emit("ticker-data-update",{ ticker_update: result.finance});
					console.log('tracking: '+data.ticker);
					stream = T.stream('statuses/filter', { track: data.ticker })
					socket.emit("new-ticker",{ticker: data.ticker});
					stream.on('tweet', function (tweet) {
						//console.log(tweet);
						socket.emit("tweet",{ author: tweet.user.name, tweet: tweet.text, date: tweet.created_at});
					});
					stream.on('limit', function (data) {
						//console.log("'#### LIMIT ####");
						socket.emit("twitter-api-limit",{});
					});
				}
			});
		});
	});
	socket.on('pause', function (data) {
		//console.log('paused');
		if(stream !== null)
				stream.emit('stop');
//		else
			//notify client with a message ?
	});
	socket.on('resume', function (data) {
		//console.log('resumed');
		if(stream !== null)
				stream.emit('start');
//		else
			//notify client with a message ?
	});
	socket.on('disconnect', function () {
    	if(stream !== null) { 
    		stream.emit('stop');
    		stream = null;
			//console.log('stream stopped!');
    	}
    	if(timedStockCheck !== null) {
    		clearInterval(timedStockCheck);
    		timedStockCheck = null;
    		//console.log('clearInterval called!');
    	}
	});
});

// Routes
app.get('/', routes.index);

app.listen(3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});