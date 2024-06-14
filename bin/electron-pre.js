const fs = require('fs-extra');
const path = require('path');

const srcTmp = path.join('tmp','src');
fs.copySync("src", srcTmp, { dereference: true });

const webTmp = path.join('tmp','web');
fs.copySync("web", webTmp, { dereference: true });
