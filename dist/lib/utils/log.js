/* eslint-disable no-console */
/* global console, window */
import assert from 'assert';

export default function log(priority) {
  var args = [], len = arguments.length - 1;
  while ( len-- > 0 ) args[ len ] = arguments[ len + 1 ];

  assert(Number.isFinite(priority), 'log priority must be a number');
  if (priority <= log.priority) {
    console.debug.apply(console, args);
  }
}

var cache = {};

function once(priority, arg) {
  var args = [], len = arguments.length - 2;
  while ( len-- > 0 ) args[ len ] = arguments[ len + 2 ];

  if (!cache[arg]) {
    log.apply(void 0, [ priority, arg ].concat( args ));
  }
  cache[arg] = true;
}

log.priority = 0;
log.log = log;
log.once = once;

// Expose to browser
if (typeof window !== 'undefined') {
  window.deck = window.deck || {log: log};
}
