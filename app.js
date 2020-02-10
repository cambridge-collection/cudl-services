//Config
config = require('./config/base.js');

//Modules
var assert = require('assert');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var debug = require('debug')('cudl-services');
var express = require('express');
var favicon = require('static-favicon');
var fs = require('fs-extra');
var logger = require('morgan');
var passport = require('passport');
var path = require('path');
var Strategy = require('passport-accesstoken').Strategy;

//cache directories
fs.ensureDir(config.cacheDir);
fs.ensureDir(config.cacheDir+'/transcriptions');
fs.ensureDir(config.cacheDir+'/translations');

if (process.getuid) {
    // TODO: this shouldn't be necessary - service shouldn't run as route, directories should be managed by puppet
    var userid = require('userid');
    fs.chown(config.cacheDir, userid.uid(config.user), userid.gid(config.group), assert.ifError);
    fs.chown(config.cacheDir+'/transcriptions', userid.uid(config.user), userid.gid(config.group), assert.ifError);
    fs.chown(config.cacheDir+'/translations', userid.uid(config.user), userid.gid(config.group), assert.ifError);
}

//Routes
//var routes = require('./routes/index.js');
var metadata = require('./routes/metadata.js');
var tags = require('./routes/tags');
var transcription = require('./routes/transcription.js');
var translation = require('./routes/translation.js');
var membership = require('./routes/membership.js');
var iiif = require('./routes/iiif.js');
var iiifannotation = require('./routes/iiif-annotation.js');
var similarity = require('./routes/similarity');
var darwin	= (require('./routes/darwin.js')(passport));
var app = express();


function findByApiKey(apikey, fn) {
    console.log(apikey);
    if (apikey in config.users) {
        return fn(null, config.users[apikey]);
    }
    return fn(null, null);
}

debug(config.users);
passport.use(new Strategy(
  function(token, done) {
    process.nextTick(function () {
      findByApiKey(token, function(err, user) {
        if (err) { return done(err); }
        //if (!user) { return done(null, false, { message: 'Unknown apikey : ' + apikey }); }
        return done(null, user);
      });
    });
  }
));


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, '/public/images/brand/favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to redirect trailing slashes to same URL without trailing slash
app.use(function(req, res, next) {
    if(req.url.substr(-1) === '/' && req.url.length > 1)
        res.redirect(301, req.url.slice(0, -1));
    else
        next();
});

//app.use('/', routes);
app.use('/v1/metadata', metadata);
app.use('/v1/tags', tags.router);
app.use('/v1/transcription',transcription);
app.use('/v1/translation', translation);
app.use('/v1/rdb/membership', membership);
app.use('/v1/iiif/annotation', iiifannotation);
app.use('/v1/iiif', iiif);
app.use('/v1/xtf/similarity', similarity);
app.use('/v1/darwin', darwin);

/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;
