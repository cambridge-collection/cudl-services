import Debugger from 'debug';
import util from 'util';
const debug = Debugger('cudl-services');

import {getApp} from './app';
import {loadConfigFromEnvar} from './config';

const config = loadConfigFromEnvar();

if(config && 'user' in config || 'group' in config) {
    throw new Error(`\
config.user and config.group are no longer supported. Remove them from the \
config and start this process with the desired user.`);
}
if (process.getuid && process.getuid() === 0) {
    throw new Error(`Running as root is not permitted`);
}

const app = getApp(config);
app.set('port', process.env.PORT || 3000);

const server = app.listen(app.get('port'), function() {
    const msg = `Express server listening on ${util.inspect(server?.address())}`;
    (debug.enabled ? debug : console.log)(msg);
});
