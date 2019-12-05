#!/usr/bin/env node
let run;
try {
  run = require('cudl-services').run;
}
catch(e1) {
  try {
    run = require('../build/dist-root/lib/server').run;
  }
  catch(e2) {
    console.error('Failed to load server entry point:');
    console.error(e1);
    console.error(e2);
    process.exit(1);
  }
}
run();
