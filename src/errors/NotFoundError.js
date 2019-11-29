var BaseError = require('./BaseError');

module.exports = function NotFoundError(message, extra) {
    NotFoundError.super_.call(this, message, extra);
};

require('util').inherits(module.exports, BaseError);
