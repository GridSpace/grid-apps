#!/usr/bin/env node

// use some high port, so it doesn't collide with other services
// debug was needed to actually run the app
require('@gridspace/app-server/app-server.js')({'port': 19757, 'debug': true});
