'use strict';

var util = require('util');
var assert = require('assert');
var fs = require('fs');

var express = require('express');
var Q = require('q');
var accepts = require('accepts');
var o2x = require('object-to-xml');
var _ = require('lodash');
var csvstringify = require('csv-stringify');

var NotFoundError = require('../lib/errors/NotFoundError');
var ValueError = require('../lib/errors/ValueError');
var InvalidConfigError = require('../lib/errors/InvalidConfigError');
var db = require('../lib/db');
var config = require('../config/base');

var router = express.Router();

router.get('/:classmark.:ext(json|xml|txt|csv)', function(req, res) {
    sendTagResponse(req, res, {type: req.params.ext});
});

router.get('/:classmark', function(req, res) {
    sendTagResponse(req, res);
});

var DEFAULT_OPTIONS = defaultOptions();

function defaultOptions() {
    var ratio = parseFloat(config.defaultRemoveRatio);
    if(isNaN(ratio)) {
        throw new InvalidConfigError(
            'defaultRemoveRatio is not a number: ' + config.defaultRemoveRatio);
    }

    return {
        removeRatio: ratio
    };
}

function sendTagResponse(req, res, options) {
    try {
        options = _.defaults({}, options, extractOptions(req), DEFAULT_OPTIONS);
    }
    catch(e) {
        handleErrors(res)(e);
    }

    db.connect()
    .then(getTagsWithRemoveCount(req.params.classmark))
    .then(incorporateRemoves(options.removeRatio))
    .then(getNegotiatedResponse(req, res, options.type))
    .then(sendResponse(res))
    .catch(handleErrors(res))
    .done();
}

function extractOptions(req) {
    var options = {
        type: req.params.ext,
    };

    if('removeRatio' in req.query) {
        var ratio = parseFloat(req.query.removeRatio);

        if(isNaN(ratio)) {
            throw new ValueError(
                'value for removeRatio is not a number: ' +
                req.query.removeRatio);
        }
        options.removeRatio = ratio;
    }

    return options;
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
                    tags: result.tags,
                    count: result.tags.length,
                    id: result.id
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
                            id: result.id
                        },
                        '#': {
                            tag: _.map(result.tags, function(tag) {
                                return {
                                    '@': {
                                        frequency: tag.frequency,
                                        'remove-count': tag.remove_count,
                                        'adjusted-frequency': tag.adjusted_frequency
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
                    return [tag.name, tag.frequency, tag.remove_count,
                            tag.adjusted_frequency];
                });

                return (Q.nfcall(csvstringify, rows, {
                    header: true,
                    columns: ['tag', 'frequency', 'remove_count',
                              'adjusted_frequency']
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
                .send('No tags found for item: ' + error.extra);
        }
        else if(error instanceof ValueError) {
            res.status(400)
                .set('Content-Type', 'text/plain')
                .send('Bad request: ' + error.message);
        }
        else {
            res.status(500).send(error.stack || util.inspect(error));
        }
    };
}

var TAGS_WITH_RM_COUNT_BY_ID_SQL = fs.readFileSync(
    require.resolve('../sql/tags-and-removedtags-by-id.sql'), 'utf-8');

function getTagsWithRemoveCount(id) {
    return function(args) {
        var client = args[0], done = args[1];
        return Q.ninvoke(client, 'query', TAGS_WITH_RM_COUNT_BY_ID_SQL, [id])
            .then(function(result) {
                // Release the db client back to the pool
                done();

                if(result.rows.length === 0) {
                    throw new NotFoundError(
                        'No DocumentTags found with id: ' + id, id);
                }

                return {
                    id: id,
                    tags: result.rows
                };
            });
    };
}

/**
 * Add frequency values adjusted by user removes.
 */
function incorporateRemoves(removeRatio) {
    return function(result) {
        _.each(result.tags, function(tag) {
            tag.adjusted_frequency = scoreWithRemoves(
                        tag.frequency, tag.remove_count, removeRatio);
        });
        return result;
    };
}

/**
 * Calculate the score/weight to give a tag, taking into account the number
 * of times it's been removed.
 *
 * The weight is used to adjust the affect removes have on the tags score. It's
 * simply multiplied with the remove count.
 *
 * The score is calculated as:
 *     max(0, frequency - (removes * ratio))
 *
 * For example, with a ratio of 5:1 (1/5) every 5 user remove votes cancels out
 * a single occurance of the tag in the source.
 *
 * @param frequency The number of times the tag was seen in the source
 *        document(s).
 * @param removes The number of times the tag's been removed by crowssourcing
 *        users.
 * @param ratio A weighting value to use when considering removes.
 */
function scoreWithRemoves(frequency, removes, ratio) {
    return Math.max(0, frequency - removes * ratio);
}

module.exports = router;
