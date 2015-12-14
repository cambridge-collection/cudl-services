var BaseError = require('./BaseError');

module.exports = function ValueError(message, extra) {
    ValueError.super_.call(this, message, extra);
};

require('util').inherits(module.exports, BaseError);
