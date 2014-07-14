//Config
config = require('./config/base.js');

var fs = require('fs-extra');
fs.ensureDir(config.cacheDir);
fs.ensureDir(config.cacheDir+'/transcriptions');
fs.ensureDir(config.cacheDir+'/translations');

//Modules
var express = require('express');
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mysql = require('mysql');

//Routes
var routes = require('./routes/index.js');
var metadata = require('./routes/metadata.js');
var transcription = require('./routes/transcription.js');
var translation = require('./routes/translation.js');
var membership = require('./routes/membership.js');
var embedded = require('./routes/embedded.js');
var iiif = require('./routes/iiif.js');
var app = express();

//MySQL Connection
connection = mysql.createPool({
	connectionLimit	: 10,
        host     : config.mysqlHost,
        user     : config.mysqlUser,
        password : config.mysqlPass,
	database : config.mysqlData,
});

//Cache Directories
fs.ensureDir(config.cacheDir+'/transcriptions');
fs.ensureDir(config.cacheDir+'/translations');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(favicon(path.join(__dirname, '/public/images/brand/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//app.use('/', routes);
app.use('/v1/metadata', metadata);
app.use('/v1/transcription',transcription);
app.use('/v1/translation', translation);
app.use('/v1/rdb/membership', membership);
app.use('/v1/embedded', embedded);
app.use('/v1/iiif', iiif);

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

console.log('hmmm');
module.exports = app;
