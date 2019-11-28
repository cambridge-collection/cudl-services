//Config
const config = require('./config/base.js');

//Modules
const assert = require('assert');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const debug = require('debug')('cudl-services');
const express = require('express');
const favicon = require('serve-favicon');
const fs = require('fs-extra');
const logger = require('morgan');
const passport = require('passport');
const path = require('path');
const Strategy = require('passport-accesstoken').Strategy;

//cache directories
fs.ensureDirSync(config.cacheDir);
fs.ensureDirSync(config.cacheDir+'/transcriptions');
fs.ensureDirSync(config.cacheDir+'/translations');

//Routes
//const routes = require('./routes/index.js');
const metadata = require('./routes/metadata.js');
const tags = require('./routes/tags');
const transcription = require('./routes/transcription.js');
const translation = require('./routes/translation.js');
const membership = require('./routes/membership.js');
const iiif = require('./routes/iiif.js');
const similarity = require('./routes/similarity');
const darwin = require('./routes/darwin.js')(passport);
const app = express();


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
app.set('view engine', 'pug');

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
