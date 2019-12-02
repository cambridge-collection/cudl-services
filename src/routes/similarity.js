var assert = require('assert');
var util = require('util');
var path = require('path');
var fs = require('fs');

var _ = require('lodash');
var express = require('express');
var Q = require('q');
var router = express.Router();
var xmldom = require('xmldom');

var config = require('../config').default;
var xtf = require('../xtf');
var serviceUtil = require('../util');
var similarityTransform = require('../transforms/similarity');

/* */
router.get('/:itemid/:similarityId', function(req, res) {
    // Allow x-domain ajax access
    res.set(serviceUtil.CORS_HEADERS);

    var item = req.params.itemid;
    // descriptive metadata id
    var similarityId = req.params.similarityId;

    var count = parseInt(req.query.count);
    count = isNaN(count) || count < 1 ? undefined : count;

    xtf.getSimilarItems(item, similarityId, count)
        .then(mapToJson)
        .then(embedMetadata(req.query.embedMeta))
        .then(function(json) {
            res.set({'content-type': 'application/json; charset=UTF-8'});
            res.json(json);
        })
        .catch(function(error) {
            // FIXME: rm this
            if(error instanceof Error) {
                console.log('Similarity fail: ' + error);
                console.log(error.stack);
            }
            else {
                console.dir(['similarity fail', error]);
            }

            // May not actually be XTF's fault, but this'll do for now!
            res.status(502).send({
                error: "Unable to get response from XTF",
                cause: String(error)
            });
        })
        .done();
});

/**
 * Map the XTF response XML to JSON in node.
 */
function mapToJson(result) {
    assert.equal(result.response.statusCode, 200);
    return similarityTransform(parseXml(result.body.toString('utf-8')));
}

/**
 * Get a function to embed metadata in a similarity hit.
 */
function embedMetadata(level) {
    // Don't embed anything unless requested
    if(!(level === 'full' || level === 'partial')) {
        return _.identity;
    }

    return function(results) {

        // Load the JSON metadata from all the hits
        var embeddedHits = _(results.hits).map(function(hit) {

            var jsonPath = path.join(config.dataDir, 'json', hit.ID + '.json');

            return Q.nfcall(fs.readFile, jsonPath, 'utf-8')
                .then(JSON.parse)
                .then(function(metadata) {

                    var meta = (level === 'full' ? {metadata: metadata} :
                        getReducedMetadata(metadata, hit.structureNodeId));

                    return _.assign({}, hit, meta);
                });
        }).value();

        return Q.all(embeddedHits)
            .then(function(hitsWithEmbeds) {
                return _.assign({}, results, {hits: hitsWithEmbeds});
            });
    };
}

/**
 * Get a subset of the metadata applicable to the provided logical structure
 * node.
 */
function getReducedMetadata(metadata, structureNodeId) {

    var structureIndex = parseInt(structureNodeId, 10);
    if(isNaN(structureIndex)) {
        throw new Error(util.format('Invalid structureId: %s', structureNodeId));
    }

    var structurePath = nthStructureNode(metadata, structureIndex);
    // Strip children from the structure path nodes
    structurePath = _.map(
        structurePath, function(node) { return _.omit(node, 'children'); });

    // The first page of the most significant structure
    var firstPage = metadata.pages[structurePath[structurePath.length - 1]
        .startPagePosition - 1];

    // We should really change descriptiveMetadata to be an object not an
    // array...
    var dmdLookup = _(metadata.descriptiveMetadata)
        .map(function(dmd) { return [dmd.ID, dmd]; })
        .object().value();

    // The descriptive metadata related to the structure path nodes
    var relatedMetadata = _(structurePath)
        .map(function(structure) {
            var dmdId = structure.descriptiveMetadataID;
            assert(dmdId in dmdLookup);
            return [dmdId, dmdLookup[dmdId]];
        })
        .object().value();

    return {
        structurePath: structurePath,
        firstPage: firstPage,
        descriptiveMetadata: relatedMetadata
    };
}

/**
 * Get the nth logical structure node, and its parents (ancestors).
 */
function nthStructureNode(metadata, n) {
    if(n < 0)
        throw new Error(util.format('n was negative: %s', n));

    var result = _nthStructureNode(n, metadata.logicalStructures, 0, []);

    if(_.isNumber(result))
        throw new Error(util.format(
            'structure index out of range. structure count: %d, index: %d',
            result, n));

    return result;
}

function _nthStructureNode(n, nodes, pos, context) {
    for(var i in nodes) {
        var node = nodes[i];
        var newContext = _(context).concat([node]).value();

        if(pos === n)
            return newContext;

        pos++;

        if(node.children) {
            var result = _nthStructureNode(n, node.children, pos, newContext);

            // Result is either the identified node (and parents) or the new
            // position to continue the search from
            if(_.isArray(result))
                return result; // node located

            pos = result;
        }
    }

    return pos;
}

function parseXml(xmlText) {
    assert.equal(typeof xmlText, 'string');

    return new xmldom.DOMParser().parseFromString(xmlText);
}

module.exports = router;
