const fs = require('fs-extra');
const path = require('path');
const server = require('@gridspace/app-server');

// deref src and web for windows
const srcTmp = path.join('tmp','src');
fs.copySync("src", srcTmp, { dereference: true });

const webTmp = path.join('tmp','web');
fs.copySync("web", webTmp, { dereference: true });

// const modTmp = path.join('tmp','mod');
// fs.copySync("mod", modTmp, { dereference: true });

// pre-build asset cache
server({
    dryrun: true,
    single: true
});
