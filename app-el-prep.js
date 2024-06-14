const fs = require('fs-extra');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const srcTmp = path.join(__dirname, 'tmp/src');
fs.copySync(srcDir, srcTmp, { dereference: true });

const webDir = path.join(__dirname, 'web');
const webTmp = path.join(__dirname, 'tmp/web');
fs.copySync(webDir, webTmp, { dereference: true });
