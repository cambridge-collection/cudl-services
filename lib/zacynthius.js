var SimpleCache = require('Simple-Cache').SimpleCache;
var debug = require('debug')('cudl:zacynthius');
var http = require('http');
var url = require('url');
var util = require('util');

var cache = SimpleCache(config.cacheDir + '/transcriptions', debug);

var DEFAULT_ZACYNTHIUS_SERVICE_URL = 'http://codex-zacynthius-transcription.cudl.lib.cam.ac.uk';
var ZACYNTHIUS_SERVICE_URL = config.zacynthiusDataService || DEFAULT_ZACYNTHIUS_SERVICE_URL;

var TYPE_UNDERTEXT = module.exports.TYPE_UNDERTEXT = 'undertext';
var TYPE_OVERTEXT = module.exports.TYPE_OVERTEXT = 'overtext';
var TYPE_TRANSLATION = module.exports.TYPE_TRANSLATION = 'translation';

var TYPES = module.exports.TYPES = [TYPE_UNDERTEXT, TYPE_OVERTEXT, TYPE_TRANSLATION];

function isValidPage(page) {
    return /\w+/.test(page);
}
module.exports.isValidPage = isValidPage;

function getZacynthiusData(type, page, cb) {
    if(TYPES.indexOf(type) === -1) {
        throw new Error(util.format('Invalid type: %s', type));
    }
    if(!isValidPage(page)) {
        throw new Error(util.format('Invalid page: %s', page));
    }

    var pageUrl = url.resolve(
        ZACYNTHIUS_SERVICE_URL,
        util.format('%s/%s.html', encodeURIComponent(type), encodeURIComponent(page)));

    var errorSent = false;

    function handleError(err, errorRes) {
        var errAttrs = {};
        var msg;
        if(err) {
            msg = util.format('Error requesting data from %s: HTTP request failed: %s', pageUrl, util.inspect(err));
        }
        else {
            var statusCode = errorRes.statusCode;
            msg = util.format('Error requesting data from %s: HTTP %d', pageUrl, statusCode);

            if(statusCode === 404) {
                errAttrs.missingPage = true;
            }
            else if(statusCode >= 500 && statusCode < 600) {
                errAttrs.isTemporary = true;
            }
        }

        debug(msg, errAttrs);
        if(!errorSent) {
            cb(Object.assign(new Error(msg), errAttrs));
            errorSent = true;
        }
    }

    cache.get(util.format('zacynthius-%s-%s', type, page), function(cacheCb) {
        http.get(pageUrl, function(res) {
            if(res.statusCode !== 200 || res.headers['content-type'] !== 'text/html') {
                res.resume();  // Ignore and clean up the response
                return handleError(undefined, res);
            }
            res.setEncoding('utf-8');
            var data = '';
            res.on('data', function(chunk) { data += chunk; });
            res.on('end', function() {
                if(!errorSent) {
                    cacheCb(data);
                }
            });
        }).on('error', handleError);
    }).fulfilled(function (data) {
        cb(null, data);
    });
}
module.exports.getZacynthiusData = getZacynthiusData;
