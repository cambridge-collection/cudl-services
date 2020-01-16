const util = require('util');
const zacynthius = require('../lib/zacynthius');
var TemporaryError = require('../lib/errors/TemporaryError');
var NotFoundError = require('../lib/errors/NotFoundError');
var html = require('../lib/html');
var jsdom = require('jsdom');
var url = require('url');
var RelateUrl = require('relateurl');

function validateType(type, types, res) {
    if(!types.includes(type)) {
        res.status(400).send(util.format('Invalid type: possible values are %s', types.join(', ')));
        return false;
    }
    return true;
}

function handleZacynthiusError(res, err) {
    if(err instanceof NotFoundError) {
        res.status(404).json({message: 'Page not found', page: page});
        return;
    }
    if(err instanceof TemporaryError) {
        res.status(502).json({message: 'Zacynthius service is temporarily unavailable'});
        return;
    }
    res.status(500).json({message: 'Something went wrong'});
}

function sendResourceResponse(res, resource) {
    res.type(resource.type).send('bytes' in resource ? resource.bytes : resource.text);
}

const createResourceHandler = module.exports.createResourceHandler = (options) => {
    if(typeof options !== 'object') {
        throw new Error('options must be an object');
    }

    const types = options.types;

    return (req, res) => {
        const type = types.length === 1 ? types[0] : req.params.type;
        if(!validateType(type, types, res)) { return; }

        const path = req.params.path;
        zacynthius.getZacynthiusResource(type, path, (err, resource) => {
            if(err) {
                handleZacynthiusError(res, err);
                return;
            }
            sendResourceResponse(res, resource);
        });
    };
};

function isSameOrigin(urlA, urlB) {
    return new URL(urlA).origin === new url.URL(urlB).origin;
}

function rewriteResourceUrls(htmlResource, type, resourceUrlRewriter) {
    const dom = new jsdom.JSDOM(htmlResource.bytes, {
        contentType: htmlResource.type,
        url: htmlResource.url
    });
    const doc = dom.window.document;

    function rewriter({baseURL, resolvedURL}) {
        if(!isSameOrigin(baseURL, resolvedURL)) {
            return undefined;
        }
        const relativeURL = RelateUrl.relate(baseURL, resolvedURL);
        return resourceUrlRewriter({type, relativeURL});
    }

    html.rewriteResourceUrls(doc, rewriter);

    return {
        text: dom.serialize(),
        type: doc.contentType
    };
}

const createDataHandler = module.exports.createDataHandler = (options) => {
    if(typeof options !== 'object') {
        throw new Error('options must be an object');
    }
    const types = options.types;
    const resourceUrlRewriter = options.resourceUrlRewriter;

    if(!(Array.isArray(types) && types.every(t => zacynthius.TYPES.includes(t)))) {
        throw new Error(`types must be an array of zacynthius data type names, got: ${util.inspect(types)}`);
    }

    return (req, res) => {
        const type = types.length === 1 ? types[0] : req.params.type;
        const page = req.params.page;

        if(!validateType(type, types, res)) { return; }
        if(!zacynthius.isValidPage(page)) {
            res.status(400).send('Invalid page');
            return;
        }

        zacynthius.getZacynthiusData(type, page, function(err, resource) {
            if(err) {
                handleZacynthiusError(res, err);
                return;
            }

            if(typeof resourceUrlRewriter === 'function') {
                resource = rewriteResourceUrls(resource, type, resourceUrlRewriter);
            }
            sendResourceResponse(res, resource);
        });
    };
};
