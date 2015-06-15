var assert = require('assert');
var util = require('util');

var _ = require('lodash');


var ELEMENT_NODE = 1,
    DOCUMENT_NODE = 9;

/**
 * Javascript reimplementation of similarity.xsl.
 */
module.exports = function transform(docNode) {
    assert.equal(docNode.nodeType, DOCUMENT_NODE);

    var root = docNode.getElementsByTagName('crossQueryResult')[0];
    expectElementWithTag(root, null, 'crossQueryResult');

    return {
        queryTime: Number(root.getAttribute('queryTime')) || undefined,
        totalDocs: parseInt(root.getAttribute('totalDocs')) || undefined,
        startDoc: parseInt(root.getAttribute('startDoc')) || undefined,
        endDoc: parseInt(root.getAttribute('endDoc')) || undefined,
        hits: getHits(root)
    };
};

function getHits(root) {
    expectElementWithTag(root, null, 'crossQueryResult');
    return _(root.getElementsByTagName('docHit')).map(getHit).value();
}

function getHit(docHit) {
    expectElementWithTag(docHit, null, 'docHit');

    var meta = docHit.getElementsByTagName('meta')[0];
    expectElementWithTag(meta, null, 'meta');

    var itemId = meta.getElementsByTagName('itemId')[0];
    expectElementWithTag(itemId, null, 'itemId');

    var structureNodeId = meta.getElementsByTagName('structureNodeId')[0];
    expectElementWithTag(structureNodeId, null, 'structureNodeId');

    return {
        score: Number(docHit.getAttribute('score')) || undefined,
        ID: itemId.textContent,
        structureNodeId: structureNodeId.textContent
    };
}

// DOM utility functions
function childElements(node) {
    return _.filter(node.children, function(node) {
        return node.nodeType === ELEMENT_NODE;
    });
}

function firstChildElement(node) {
    var children = childElements(node);
    if(children.length < 1) {
        throw new Error(util.format('Element has no child elements: %s',
                                    node));
    }
    return children[0];
}

function expectNodeWithType(node, type) {
    if(node.nodeType !== type) {
        throw new Error(util.format('Expected a node of type %d but got: %d',
                                    type, node.type));
    }

    return node;
}

function expectElementWithTag(el, ns, tag) {
    expectNodeWithType(el, ELEMENT_NODE);

    if(qualifiedName(el) !== qualifiedName(ns, tag)) {
        throw new Error(util.format('Expected tag %s but got: %s',
            qualifiedName(ns, tag), qualifiedName(el)));
    }

    return el;
}

/**
 * Get a string representation of an element's tag name as {nsURI}tag.
 *
 * Arguments are (el) | (tagName) | (namespaceURI, tagName).
 */
function qualifiedName(el) {
    var ns, name;
    if(_.isObject(el)) {
        ns = el.namespaceURI;
        name = el.localName || el.tagName;
    }
    else {
        if(arguments.length == 1) {
            ns = null;
            name = arguments[0];
        }
        else {
            ns = arguments[0];
            name = arguments[1];
        }
    }

    if(!ns) {
        return name;
    }
    return util.format('{%s}%s', ns, name);
}
