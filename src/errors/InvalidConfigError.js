var BaseError = require('./BaseError');

module.exports = function InvalidConfigError(message, extra) {
    InvalidConfigError.super_.call(this, message, extra);
};

require('util').inherits(module.exports, BaseError);
