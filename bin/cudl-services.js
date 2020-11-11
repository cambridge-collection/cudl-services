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

let run;
try {
  // eslint-disable-next-line node/no-missing-require
  run = require('cudl-services').run;
} catch (e1) {
  try {
    // eslint-disable-next-line node/no-missing-require
    run = require('../build/dist-root/lib/server').run;
  } catch (e2) {
    console.error('Failed to load server entry point:');
    console.error(e1);
    console.error(e2);
    process.exit(1);
  }
}
run();
