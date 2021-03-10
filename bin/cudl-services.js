#!/usr/bin/env node

// Using process.exit() is fine as we actually want to set the exit status,
// and this is the entrypoint, so we know we're responsible for the whole
// process.
/* eslint-disable no-process-exit */

if (process.pid === 1 && !process.env.ALLOW_NO_INIT_PROCESS) {
  console.error(`\
Error: node is running as PID 1; this is not allowed as node cannot reap child
  processes. If you're running with docker, pass --init to the run command to
  wrap node in a suitable init process.`);
  process.exit(1);
}

if (process.getuid && process.getuid() === 0) {
  console.error('Error: Running as root is not permitted');
  process.exit(1);
}

let server;
try {
  // eslint-disable-next-line node/no-missing-require
  server = require('cudl-services');
} catch (e1) {
  try {
    // eslint-disable-next-line node/no-missing-require
    server = require('../build/dist-root/lib/server');
  } catch (e2) {
    console.error('Failed to load server entry point:');
    console.error(e1);
    console.error(e2);
    process.exit(1);
  }
}

server.Server.start({port: process.env.PORT || 3000}).catch(e => {
  if (e instanceof server.ServerError) {
    console.error(`Error: ${e.message}`);
  } else {
    console.error('Error: Server exited with an uncaught exception:\n\n', e);
  }
  process.exit(1);
});
