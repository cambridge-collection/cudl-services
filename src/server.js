const debug = require('debug')('cudl-services');

const app = require('./app');
const config = require('../config/base');

if(config && 'user' in config || 'group' in config) {
    throw new Error(`\
config.user and config.group are no longer supported. Remove them from the \
config and start this process with the desired user.`);
}
if (process.getuid && process.getuid() === 0) {
    throw new Error(`Running as root is not permitted`);
}

app.set('port', process.env.PORT || 3000);

var server = app.listen(app.get('port'), function() {
  debug('Express server listening on port ' + server.address().port);
});
