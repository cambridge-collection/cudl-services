'use strict';

var util = require('util');
var assert = require('assert');

var express = require('express');
var Q = require('q');
var accepts = require('accepts');
var o2x = require('object-to-xml');
var _ = require('lodash');
var csvstringify = require('csv-stringify');

var NotFoundError = require('../lib/errors/NotFoundError');
var db = require('../lib/db');

var router = express.Router();

router.get('/:classmark.:ext(json|xml|txt|csv)', function(req, res) {
    sendTagResponse(req, res, {type: req.params.ext});
});

router.get('/:classmark', function(req, res) {
    sendTagResponse(req, res);
});

function sendTagResponse(req, res, options) {
    options = options || {};

    db.connect()
    .then(getTags(req.params.classmark))
    .then(getNegotiatedResponse(req, res, options.type))
    .then(sendResponse(res))
    .catch(handleErrors(res))
    .done();
}

function sendResponse(res) {
    return function(result) {
        res.set('Content-Type', result.type)
            .send(result.body);
    };
}

function getNegotiatedResponse(req, res, fixedType) {
    return function(result) {
        var accept = accepts(req);

        var negotiatedType = fixedType || accept.type(['json', 'xml']);

        switch(negotiatedType) {
            case 'json':
                var json = {
                    tags: _.map(result.tags, function(tag) {
                        return {
                            name: tag.name,
                            weight: tag.value,
                            frequency: tag.raw
                        };
                    }),
                    count: result.tags.length,
                    id: result.docId
                };
                return {
                    type: 'application/json',
                    body: JSON.stringify(json)
                };
            case 'xml':
                var xml = {
                    tags: {
                        '@': {
                            count: result.tags.length,
                            id: result.docId
                        },
                        '#': {
                            tag: _.map(result.tags, function(tag) {
                                return {
                                    '@': {
                                        weight: tag.value,
                                        frequency: tag.raw
                                    },
                                    '#': tag.name
                                };
                            })
                        }
                    }
                };

                return {
                    type: 'application/xml',
                    body: o2x(xml)
                };
            case 'csv':
                /* falls through */
            case 'txt':
                /* falls through */
            default:
                var rows = _.map(result.tags, function(tag) {
                    return [tag.name, tag.value, tag.raw];
                });

                return (Q.nfcall(csvstringify, rows, {
                    header: true,
                    columns: ['tag', 'weight', 'frequency']
                })
                .then(function(csv) {
                    return {
                        type: negotiatedType == 'csv' ? 'text/csv' : 'text/plain',
                        body: csv
                    };
                }));
        }
    };
}

function handleErrors(res) {
    return function (error) {
        if(error instanceof NotFoundError) {
            res.status(404)
                .set('Content-Type', 'text/plain')
                .end('No tags found for item: ' + error.extra);
        }
        else {
            res.status(500).end(error.stack || util.inspect(error));
        }
    };
}

function getTags(id) {
    return function(args) {
        assert(args.client);
        assert(args.done);
        var client = args.client, done = args.done;
        var query = 'SELECT tags FROM "DocumentTags" WHERE "docId" = $1';
        return Q.ninvoke(client, 'query', query, [id])
            .then(function(result) {
                // Release the db client back to the pool
                done();

                if(result.rows.length === 0) {
                    throw new NotFoundError(
                        'No DocumentTags row found with id: ' + id, id);
                }

                return result.rows[0].tags;
            });
    };
}

module.exports = router;
