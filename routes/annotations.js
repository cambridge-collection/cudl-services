'use strict';

var fs = require('fs');

var express = require('express');
var js2xmlparser = require('js2xmlparser');
var _ = require('lodash');
var csvstringify = require('csv-stringify');
var Q = require('q');
var accepts = require('accepts');

var db = require('../lib/db');
var items = require('../lib/items');
var tagsRoute = require('./tags');

var router = express.Router();

router.get('/:classmark.:ext(json|xml|txt|csv)', function(req, res) {
    sendAnnotationResponse(req, res, {type: req.params.ext});
});

router.get('/:classmark', function(req, res) {
    sendAnnotationResponse(req, res);
});

function extractOptions(req) {
    return {
        type: req.params.ext
    };
}

function sendAnnotationResponse(req, res, options) {
    options = _.defaults({}, options, extractOptions(req));

    Q.all([
        // Returns list of tags
        getAnnotations(req.params.classmark),
        // Does not return value, only throws if tag doesn't exist
        items.ensureItemExists(req.params.classmark)
    ])
    .spread(getNegotiatedResponse(req, res, options.type))
    .then(tagsRoute.sendResponse(res))
    .catch(tagsRoute.handleErrors(res))
    .done();
}

var ANNOTATIONS_BY_ITEM = fs.readFileSync(
    require.resolve('../sql/annotations-by-item.sql'), 'utf-8');

/**
 * Get a promise resolving to the list of annotations for the item with id.
 */
function getAnnotations(id) {
    return db.query(ANNOTATIONS_BY_ITEM, [id])
    .then(function(result) {
        return {
            id: id,
            annotations: result.rows
        };
    });
}


function getNegotiatedResponse(req, res, fixedType) {
    return function(result) {
        var accept = accepts(req);

        var negotiatedType = fixedType || accept.type(['json', 'xml']);

        switch(negotiatedType) {
            case 'json':
                return {
                    type: 'application/json',
                    body: JSON.stringify({
                        id: result.id,
                        annotations: result.annotations,
                        count: result.annotations.length
                    })
                };
            case 'xml':
                var xml = {
                    '@': {
                        count: result.annotations.length,
                        id: result.id
                    },
                    annotation: _.map(result.annotations, function(annotation) {
                        return {
                            '@': {
                                'page': annotation.page
                            },
                            '#': annotation.value,
                            '=': annotation.type
                        };
                    })
                };

                return {
                    type: 'application/xml',
                    body: js2xmlparser('annotations', xml)
                };
            case 'csv':
                /* falls through */
            case 'txt':
                /* falls through */
            default:
                var rows = _.map(result.annotations, function(annotation) {
                    return [annotation.type, annotation.value, annotation.page];
                });

                return Q.nfcall(csvstringify, rows, {
                    header: true,
                    columns: ['type', 'value', 'page']
                })
                .then(function(csv) {
                    return {
                        type: negotiatedType == 'csv' ? 'text/csv' : 'text/plain',
                        body: csv
                    };
                });
        }
    };
}

module.exports = {
    router: router
};
