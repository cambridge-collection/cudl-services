// As with bin/cudl-services.js (which calls run() here) using process.exit()
// is fine as we actually want to set the exit status.
/* eslint-disable no-process-exit */

import Debugger from 'debug';
import util from 'util';
import {Config, loadConfig} from './config';
import {using} from './resources';

const debug = Debugger('cudl-services');

async function runAsync() {
  let config: Config;
  try {
    config = await loadConfig();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.error('Setting envar DEBUG=cudl-services:config may help');
    process.exit(1);
  }

  if (process.getuid && process.getuid() === 0) {
    console.error('Error: Running as root is not permitted');
    process.exit(1);
  }

  await using(config.createApplication(), async application => {
    application.expressApp.set('port', process.env.PORT || 3000);

    const server = application.expressApp.listen(
      application.expressApp.get('port'),
      () => {
        const msg = `Express server listening on ${util.inspect(
          server?.address()
        )}`;
        (debug.enabled ? debug : console.log)(msg);
      }
    );

    await new Promise((resolve, reject) => {
      function shutdown() {
        process.stdout.write(' Shutting down gracefully... ');
        server.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      }

      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      server.once('error', reject);
      server.once('close', resolve);
    });
  });
  console.log('server stopped.');
}

export function run() {
  runAsync().catch(e => {
    console.error('Error: Server exited with an uncaught exception:\n\n', e);
    process.exit(1);
  });
}
