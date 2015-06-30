(function() {
'use strict';

var assert = require('assert');
var util = require('util');

var _ = require('lodash');

var NS = 'http://cudl.lib.cam.ac.uk/ns/json';

var TAGS = {
    'object': object2json,
    'array': array2json,
    'string': string2json,
    'number': number2json,
    'true': bool2json,
    'false': bool2json,
    'null': null2json
};


var ELEMENT_NODE = 1,
    DOCUMENT_NODE = 9;

/**
 * Convert an xmldom tree to JSON. The structure of the XML document must be as
 * follows.
 *
 * All ements are in the namespace: http://cudl.lib.cam.ac.uk/ns/json
 * The structure follows the JSON schema (http://json.org/) where each grammar
 * element is represented as an XML element in the above namespace. Object keys
 * are represented as key attributes on the children of object elements.
 *
 * For example, the following JSON: {a: 1.2, b: ["text"]}
 * Would be represented as:
 * <object xmlns="http://cudl.lib.cam.ac.uk/ns/json">
 *   <number key="a">1.2</number>
 *   <array><string>text</string></array>
 * </object>
 */
module.exports = function xml2json(xml) {
    assert.equal(xml.nodeType, DOCUMENT_NODE);

    var childElements = _.filter(xml.childNodes, function(node) {
        return node.nodeType == ELEMENT_NODE;
    });

    assert.equal(childElements.length, 1);
    var root = childElements[0];

    return convert(root);
};


function getType(element) {
    if(element.nodeType !== ELEMENT_NODE) {
        throw new Error(util.format('Unexpected content: %s', element));
    }

    if(element.namespaceURI === NS) {
        var type = TAGS[element.localName];
        if(typeof type === 'function') {
            return type;
        }
    }
    throw new Error(util.format(
        'Unexpected element: {%s}%s', element.namespaceURI, element.localName));
}

function convert(el) {
    return getType(el)(el);
}

function object2json(el) {
    assert.equal(el.namespaceURI, NS);
    assert.equal(el.localName, 'object');
    return _(el.childNodes)
        .filter(function(node) { return node.nodeType === ELEMENT_NODE; })
        .map(objectEntry).object().value();
}

function array2json(el) {
    assert.equal(el.namespaceURI, NS);
    assert.equal(el.localName, 'array');

    return _(el.childNodes).map(convert).value();
}

function string2json(el) {
    assert.equal(el.namespaceURI, NS);
    assert.equal(el.localName, 'string');

    return el.textContent;
}

function number2json(el) {
    assert.equal(el.namespaceURI, NS);
    assert.equal(el.localName, 'number');

    if(el.textContent.trim() === '') {
        throw new Error('Empty number element encountered');
    }

    var number = Number(el.textContent);
    if(isNaN(number)) {
        throw new Error(util.format('Invalid number: %s', el.textContent));
    }
    return number;
}

function bool2json(el) {
    assert.equal(el.namespaceURI, NS);

    if(el.localName === 'true')
        return true;
    if(el.localName === 'false')
        return false;

    assert(false, 'non-bool el passed to bool2number'); // never happens
}

function null2json(el) {
    assert.equal(el.namespaceURI, NS);
    assert.equal(el.localName, 'null');

    return null;
}

function objectEntry(element) {
    if(!element.hasAttributeNS(null, 'key')) {
        throw new Error(util.format(
            'Child element of object has no key attribute: %s', element));
    }
    var key = element.getAttributeNS(null, 'key');
    return [key, convert(element)];
}

})();
