(function() {
'use strict';

var path = require('path');

var Q = require('q');
var xslt = require('xslt4node');

xslt.addLibrary(path.join(__dirname, '..', 'saxon', 'saxon9he.jar'));

/**
 * Return a promise containing the result of passing the XML document in source
 * through the XSLT file specified by xsltPath.
 */
module.exports.transform = function transform(xsltPath, source, params) {
    return Q.Promise(function(resolve, reject) {

        var config = {
            xsltPath: xsltPath,
            source: source,
            result: String,
            params: params
        };

        xslt.transform(config, function(err, result) {
            if(err) {
                reject(err);
            }
            resolve(result);
        });
    });
};

})();
