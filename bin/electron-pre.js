const fs = require('fs-extra');
const path = require('path');
const server = require('@gridspace/app-server');

// deref src, web, mod for windows
const srcTmp = path.join('tmp','src');
fs.copySync("src", srcTmp, { dereference: true });

const webTmp = path.join('tmp','web');
fs.copySync("web", webTmp, { dereference: true });

const modTmp = path.join('tmp','mod');
fs.copySync("mod", modTmp, { dereference: true, filter:(src,dst) => {
    const ok =
        src === 'mod' ||
        src.indexOf('mod/standalone') === 0 ||
        src.indexOf('mod/node_modules') === 0;
    // console.log(ok, src);
    return ok;
} });

// create minified asset cache
server({
    electron: true,
    dryrun: true,
    single: true
});
