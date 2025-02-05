const fs = require('fs-extra');
const path = require('path');
const server = require('@gridspace/app-server');

// deref src, web, mod for windows
const srcTmp = path.join('tmp','src');
fs.copySync("src", srcTmp, { dereference: true });

const webTmp = path.join('tmp','web');
fs.copySync("web", webTmp, { dereference: true });

const modTmp = path.join('tmp','mod');
if (fs.existsSync("mod"))
fs.copySync("mod", modTmp, { dereference: true, filter:(src,dst) => {
    const ok =
        src === 'mod' ||
        src.indexOf('mod/standalone') === 0 ||
        src.indexOf('mod/node_modules') === 0;
    return ok;
} });

const modsTmp = path.join('tmp','mods');
fs.copySync("mods", modsTmp, { dereference: true, filter:(src,dst) => {
    const ok =
        src === 'mods' ||
        src.indexOf('mods/bambu') === 0 ||
        src.indexOf('mods/electron') === 0 ||
        src.indexOf('mods/node_modules') === 0;
    return ok;
} });

// create minified asset cache
server({
    electron: true,
    dryrun: true,
    single: true
});
