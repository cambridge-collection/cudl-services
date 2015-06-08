(function() {
'use strict';

var util = require('util');
var url = require('url');
var http = require('http');
var assert = require('assert');

var Q = require('q');
var _ = require('lodash');

var _config = require('../config/base');

function validateConfig(config) {
    if((!_.isString(config.xtfBase)) && config.xtfBase.length > 0) {
        throw new Error('config.xtfBase is not set');
    }

    if((!_.isString(config.xtfIndexPath)) && config.xtfIndexPath.length > 0) {
        throw new Error('config.xtfIndexPath is not set');
    }
}

function getUrl(relative, config) {
    config = config || _config;
    validateConfig(config);

    var resolved = url.resolve(config.xtfBase, relative);

    // merge in the indexPath query param
    var parsed = url.parse(resolved, true);
    parsed.query.indexPath = config.xtfIndexPath;
    delete parsed.search;

    return url.format(parsed);
}

function httpGet(options) {
    return Q.Promise(function(resolve, reject) {
        var request = http.get(options);

        request.on('error', reject);
        request.on('response', function(response) {

            var chunks = [];

            response.on('data', function(chunk) {
                assert(chunk instanceof Buffer);
                chunks.push(chunk);
            });

            response.on('end', function() {
                var body = Buffer.concat(chunks);
                resolve({
                    response: response,
                    body: body
                });
            });
        });
    });
}

function search(options) {
    options = _.assign({
        smode: null,
        config: null,
        docsPerPage: null,
        startDoc: null, // 1-based
        normalizeScores: true
    }, options);

    var searchUrl = getUrl(url.format({
        pathname: 'search',
        // raw has to be true to get XML output
        query: _.assign({}, options, {raw: true})
    }));

    return httpGet(searchUrl).then(function(result) {
        var response = result.response;

        if(response.statusCode != 200) {
            throw new Error(util.format(
                'Non-200 status code received from XTF: %d',
                response.statusCode));
        }

        if(response.headers['content-type'] !== 'text/xml') {
            throw new Error(util.format(
                'Unexpected content type received from XTF: %s',
                response.headers['content-type']));
        }

        return result;
    });
}

/**
 * Query XTF for items similar to the specified descriptive metadata section of
 * a CUDL item identified by classmark.
 */
module.exports.getSimilarItems = function getSimilarItems(classmark, metadataId, count) {
    count = count || 5;

    // In the XTF index we identify metadata sections as classmark / dmd ID.
    // XTF uses this identifier field in similarity queries
    var identifier = util.format('%s/%s', classmark, metadataId);

    return search({smode: 'moreLike', identifier: identifier});
};

})();
