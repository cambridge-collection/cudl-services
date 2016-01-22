var assert = require('assert');
var util = require('util');
var fs = require('fs');

var Q = require('q');
var _ = require('lodash');
var express = require('express');
var accepts = require('accepts');
var o2x = require('object-to-xml');
var csvstringify = require('csv-stringify');

var db = require('../lib/db');
var NotFoundError = require('../lib/errors/NotFoundError');
var ValueError = require('../lib/errors/ValueError');

/**
 * A TagSet is an immutable set of unique tag names associated with numeric
 * values.
 *
 * This function constructs a TagSet from an array of tag data.
 *
 * @param [tags] An array of [tag, value] pairs, where tag is a string and value
                 a number.
 */
function TagSet(tags) {
    if(tags === undefined)
        tags = [];

    this.tags = {};
    this._addAll(tags);
}
_.assign(TagSet.prototype, {
    /** Private. Add an array of tag name, value pairs to this TagSet. */
    _addAll: function(tags) {
        if(!_.isArray(tags))
            throw new ValueError('tags must be an array, got: ' + tags);

        // Validate each tag
        _.each(tags, function(tag, i) {
            var err =
                !_.isArray(tag) ? 'tag must be an array, got: ' + tag :
                tag.length != 2 ? 'tag must be of length 2, got: ' + tag.length :
                !_.isString(tag[0]) ? 'first element must be a string, got: ' + tag[0] :
                !_.isNumber(tag[1]) ? 'second element must be a number, got: ' + tag[1] :
                undefined;

            if(err !== undefined)
                throw new ValueError(
                    util.format('Invalid tag @ index %d: %s', i, err));
        });

        var self = this;
        _.each(tags, function(tag) {
            var name = tag[0],
                value = tag[1];

            self.tags[name] = value;
        });
    },

    getTags: function() {
        return _.keys(this.tags);
    },

    contains: function(tagName) {
        return tagName in this.tags;
    },

    getValue: function(tagName) {
        if(!this.contains(tagName))
            this._tagNotFound(tagName);
        return this.tags[tagName];
    },

    asObject: function() {
        var self = this;
        return _(this.getTags())
            .map(function(tagName) { return [tagName, self.getValue(tagName)]; })
            .tap(function(x) { console.log(x); })
            .object()
            .value();
    },

    _tagNotFound: function (tagName) {
        throw new NotFoundError('No such tag name: ' + tagName);
    }
});

// A TagSet which presents a view of another TagSet. This is intended to be
// used as a base class for views which modify the viewed TagSet in some way,
// as this view does nothing to modify the viewed TagSet.
function ViewTagSet(tagSet) {
    this.parentTagSet = tagSet;
}
// Inherit the asObject method
util.inherits(ViewTagSet, TagSet);
_.assign(ViewTagSet.prototype, {
    getTags: function() {
        return this.parentTagSet.getTags();
    },

    contains: function(tagName) {
        return this.parentTagSet.contains(tagName);
    },

    getValue: function(tagName) {
        return this.parentTagSet.getValue(tagName);
    }
});

/**
 * Presents a view of TagSet with values adjusted by a weighting factor.
 *
 * @param tagSet: The set of tags to be weighted.
 * @param weight: The weighting factor to be multiplied with the tag values
                  from tagSet.
 */
function WeightedTagSet(tagSet, weight) {
    this.constructor.super_.call(this, tagSet);
    this.weight = weight;
}
util.inherits(WeightedTagSet, ViewTagSet);
_.assign(WeightedTagSet.prototype, {
    getValue: function(tagName) {
        return this.parentTagSet.getValue(tagName) * this.weight;
    }
});

function MergedTagSet(tagSources, mergeValues) {
    if(mergeValues !== undefined && !_.isFunction(mergeValues))
        throw new ValueError(
            'mergeValues must be a function if provided, got: ' + mergeValues);

    this.tagSources = _.clone(tagSources);
    this.mergeValues = mergeValues || _.add;
}
util.inherits(MergedTagSet, TagSet);
_.assign(MergedTagSet.prototype, {
    getTags: function() {
        return _(this.tagSources)
            .map(function(ts) {
                return ts.getTags();
            })
            .flatten()
            .uniq()
            .value();
    },

    contains: function (tagName) {
        return _.some(this.tagSources, function(ts) {
            return ts.contains(tagName);
        });
    },

    getValue: function (tagName) {
        var value = _(this.tagSources)
            .filter(function(ts) { return ts.contains(tagName); })
            .map(function(ts) { return ts.getValue(tagName); })
            .reduce(this.mergeValues);

        if(value === undefined)
            this._tagNotFound(tagName);

        return value;
    }
});

function FilterTagSet(tagSource, predicate) {
    if(!(predicate === undefined || _.isFunction(predicate)))
        throw new ValueError('predicate must be a function if provided, got: ' +
                             predicate);
    this.constructor.super_.call(this, tagSource);
    this.predicate = predicate || this.defaultPredicate;
}
util.inherits(FilterTagSet, ViewTagSet);
_.assign(FilterTagSet.prototype, {
    defaultPredicate: function() { return true; },

    getTags: function() {
        return _.filter(this.parentTagSet.getTags(),
                        this.contains.bind(this));
    },

    contains: function(tagName) {
        return this.parentTagSet.contains(tagName) &&
            this.predicate(tagName,
                           this.parentTagSet.getValue(tagName),
                           this.parentTagSet);
    },

    getValue: function(tagName) {
        if(!this.contains(tagName))
            this._tagNotFound(tagName);

        return this.parentTagSet.getValue(tagName);
    }
});

function tagSetFromRows(queryResult, options) {
    options = _.defaults(options || {},
                         {tagnameKey: 'tagname', valueKey: 'frequency'});

    var pairs = _.map(queryResult.rows, function(r) {
        assert(_.isNumber(r[options.valueKey]), r[options.valueKey]);

        return [r[options.tagnameKey], r[options.valueKey]];
    });
    return new TagSet(pairs);
}

var REMOVED_TAG_FREQ_SQL = fs.readFileSync(
    require.resolve('../sql/removed-tag-frequency-by-item.sql'), 'utf-8');

function removedTags(docId) {
    return db.query(REMOVED_TAG_FREQ_SQL, [docId])
    .then(tagSetFromRows);
}

var TAG_FREQ_SQL = fs.readFileSync(
    require.resolve('../sql/tag-frequency-by-item.sql'), 'utf-8');

function thirdPartyTags(docId) {
    return db.query(TAG_FREQ_SQL, [docId])
    .then(tagSetFromRows);
}

var ANNOTATION_FREQ_SQL = fs.readFileSync(
    require.resolve('../sql/annotation-frequency-by-item.sql'), 'utf-8');

function annotationTags(docId) {
    return db.query(ANNOTATION_FREQ_SQL, [docId])
    .then(tagSetFromRows);
}

var tagSources = {
    '3rd-party': {
        factory: thirdPartyTags,
        weight: 1
    },
    'annotations': {
        factory: annotationTags,
        weight: 1/5
    },
    'user-removes': {
        factory: removedTags,
        weight: 1/5
    }
};

function sendTagResponse(req, res, options) {
    options = _.defaults(options || {}, {
        sources: _.keys(tagSources).join(',')
    });

    try {
        var sources = getTagSources(options.sources);

        loadTags(sources, req.params.classmark)
        .then(getNegotiatedResponse(req, res, options.type))
        .then(sendResponse(res))
        .catch(handleErrors(res))
        .done();
    }
    catch(e) {
        handleErrors(res)(e);
    }
}

function getTagSources(srcList) {
    var sourceNames = srcList.split(',');

    if(_.uniq(sourceNames).length < sourceNames.length)
        throw new ValueError('source list contained a duplicate name');

    return _.map(sourceNames, function(name) {
        if(!(name in tagSources))
            throw new ValueError('No tag source exists with name: ' + name);
        return tagSources[name];
    });
}

/**
 * Merge one or more TagSets by summing values of tags occuring in more than
 * one set. Tags without positive values are excluded.
 */
function mergeTagSets(tagSets) {
    return new FilterTagSet(
        new MergedTagSet(tagSets),
        function(_, value) { return value > 0; });
}

/**
 * Load the provided array of tag sources, weighting them accordingly,
 * merging the results together and excluding tags without positive values.
 */
function loadTags(sources, docId) {
    var tagSetPromises = _.map(sources, function(tagSource) {
        return tagSource.factory(docId)
        .then(function(tagSet) {
            return new WeightedTagSet(tagSet, tagSource.weight);
        });
    });

    return Q.all(tagSetPromises)
    .then(mergeTagSets)
    .then(function(tagSet) {
        return {
            id: docId,
            tags: tagSet
        };
    });
}

function getNegotiatedResponse(req, res, fixedType) {
    return function(result) {
        var accept = accepts(req);

        var negotiatedType = fixedType || accept.type(['json', 'xml']);

        switch(negotiatedType) {
            case 'json':
                var tagObj = result.tags.asObject();
                var json = {
                    tags: tagObj,
                    count: tagObj.length,
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
                            count: result.tags.getTags().length,
                            id: result.id
                        },
                        '#': {
                            tag: _(result.tags.getTags())
                                .map(function(tagName) {
                                    return {
                                        '@': {
                                            value: result.tags.getValue(tagName)
                                        },
                                        '#': tagName
                                    };
                                })
                                .sortByOrder([
                                        function(x) { return x['@'].value; },
                                        function(x) { return x['#']; }
                                    ], ['desc', 'asc'])
                                .value()
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
                var rows = _(result.tags.getTags())
                    .map(function(tagName) {
                        return [tagName, result.tags.getValue(tagName)];
                    })
                    .sortByOrder([1, 0], ['desc', 'asc'])
                    .value();

                return Q.nfcall(csvstringify, rows, {
                    header: true,
                    columns: ['tag', 'value']
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

function sendResponse(res) {
    return function(result) {
        res.set('Content-Type', result.type)
            .send(result.body);
    };
}

function handleErrors(res) {
    return function (error) {
        if(error instanceof NotFoundError) {
            res.status(404)
                .set('Content-Type', 'text/plain')
                .send('Item does not exist: ' + error.extra);
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

var router = express.Router();
router.get('/:classmark.:ext(json|xml|txt|csv)', function(req, res) {
    sendTagResponse(req, res, {
        type: req.params.ext,
        sources: req.query.sources
    });
});

router.get('/:classmark', function(req, res) {
    sendTagResponse(req, res, {sources: req.query.sources});
});
module.exports.router = router;
