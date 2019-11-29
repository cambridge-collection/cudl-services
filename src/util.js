var url = require("url");
var regexpQuote = require("regexp-quote");


var CUDL_HOST = "cudl.lib.cam.ac.uk";
var CUDL_HOST_REGEX = new RegExp("(?:^|\\.)" + regexpQuote(CUDL_HOST) + "$");

var CORS_HEADERS = module.exports.CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*"
};


module.exports.isExternalCorsRequest = function isExternalCorsRequest(req) {
    var origin = req.header("origin") || "";
    if(!origin) { return false; }

    var host = url.parse(origin).hostname;

    // If we have an origin header and it's not cudl, then it's an external cors
    // request.
    return !CUDL_HOST_REGEX.test(host);
};
