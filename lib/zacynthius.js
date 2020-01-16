var SimpleCache = require('Simple-Cache').SimpleCache;
var debug = require('debug')('cudl:zacynthius');
var http = require('http');
var url = require('url');
var util = require('util');
var request = require('superagent');
var TemporaryError = require('./errors/TemporaryError');
var NotFoundError = require('./errors/NotFoundError');

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

// Increment when cached data format has incompatible changes
const CACHE_VERSION = 2;

function getZacynthiusResource(type, path, cb) {
    if(url.parse(path).pathname !== path || path.startsWith('/')) {
        throw new Error(`invalid path: ${path}`);
    }

    const typeUrl = url.resolve(ZACYNTHIUS_SERVICE_URL, `${encodeURIComponent(type)}/`);
    const resourceUrl = url.resolve(typeUrl, path);

    // handle path containing .. segments
    if(!resourceUrl.startsWith(typeUrl)) {
        throw new Error(`invalid path: ${path}`);
    }

    var errorSent = false;
    function handleError(err, errorRes) {
        var errorClass = Error;
        var msg;
        if(err) {
            if(err.response) {
                return handleError(null, err.response);
            }
            msg = util.format('Error requesting data from %s: HTTP request failed: %s', url, util.inspect(err));
        }
        else {
            var statusCode = errorRes.statusCode;
            msg = util.format('Error requesting data from %s: HTTP %d', url, statusCode);

            if(statusCode === 404) {
                errorClass = NotFoundError;
            }
            else if(statusCode >= 500 && statusCode < 600) {
                errorClass = TemporaryError;
            }
        }

        debug(msg, errAttrs);
        if(!errorSent) {
            cb(new errorClass(msg));
            errorSent = true;
        }
    }

    cache.get(`zacynthius-${CACHE_VERSION}-${type}-${path}`, function(cacheCb) {
        request
            .get(resourceUrl).buffer(true).parse(request.parse.image)
            .then(res => {
                if(!(res.ok)) {
                    return handleError(null, res);
                }
                if(!(res.body instanceof Buffer)) {
                    throw new Error('Unexpected response data');
                }
                cacheCb({type: res.type, bytes: res.body.toString('base64'), url: resourceUrl});
            })
            .catch(err => {
                handleError(err);
            });
    }).fulfilled(function (data) {
        // Decode cached base64 binary
        data.bytes = Buffer.from(data.bytes, 'base64');
        cb(null, data);
    });
}
module.exports.getZacynthiusResource = getZacynthiusResource;

function getZacynthiusData(type, page, cb) {
    if(TYPES.indexOf(type) === -1) {
        throw new Error(util.format('Invalid type: %s', type));
    }
    if(!isValidPage(page)) {
        throw new Error(util.format('Invalid page: %s', page));
    }

    getZacynthiusResource(type, `${encodeURIComponent(page)}.html`, (err, resource) => {
        if(err) {
            cb(err);
            return;
        }
        if(!resource.type.startsWith('text/html')) {
            cb(new Error(`Unexpected page content-type: ${resource.type}`));
            return;
        }
        cb(null, resource);
    });
}
module.exports.getZacynthiusData = getZacynthiusData;
