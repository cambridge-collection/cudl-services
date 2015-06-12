(function() {
'use strict';

var assert = require('assert');
var path = require('path');

var express = require('express');
var router = express.Router();
var xmldom = require('xmldom');

var xtf = require('../lib/xtf');
var xslt = require('../lib/xslt');
var xml2json = require('../lib/xml2json');
var serviceUtil = require('../util');

var XSLT_TX = path.join(__dirname, '..', 'transforms', 'similarity.xsl');

/* */
router.get('/:itemid/:similarityId', function(req, res) {
    // Allow x-domain ajax access
    res.set(serviceUtil.CORS_HEADERS);

    var item = req.params.itemid;
    // descriptive metadata id
    var similarityId = req.params.similarityId;

    xtf.getSimilarItems(item, similarityId)
        .then(function(result) {
            assert.equal(result.response.statusCode, 200);

            return xslt.transform(XSLT_TX, result.body);
        })
        .then(parseXml)
        .then(xml2json)
        .then(function(json) {
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
 * Convert an XTF raw XML response to a JSON response for similar items.
 */
function buildJson(xtfXmlResponse) {

}

function parseXml(xmlText) {
    assert.equal(typeof xmlText, 'string');

    return new xmldom.DOMParser().parseFromString(xmlText);
}

module.exports = router;
})();
