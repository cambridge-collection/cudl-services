import Debugger from 'debug';
import util from 'util';
const debug = Debugger('cudl-services');

import { getAppForConfig } from './app';
import {Config, loadConfigFromEnvar} from './config';

let config: Config;
try {
  config = loadConfigFromEnvar();
}
catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}

if ((config && 'user' in config) || 'group' in config) {
  console.error(`\
Error: config.user and config.group are no longer supported. Remove them from the \
config and start this process with the desired user.`);
  process.exit(1);
}
if (process.getuid && process.getuid() === 0) {
  console.error('Error: Running as root is not permitted');
  process.exit(1);
}

const app = getAppForConfig(config);
app.set('port', process.env.PORT || 3000);

const server = app.listen(app.get('port'), () => {
  const msg = `Express server listening on ${util.inspect(server?.address())}`;
  (debug.enabled ? debug : console.log)(msg);
});
