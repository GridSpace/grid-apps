/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/lang.js';
import '../kiri/lang-en.js';
import { run } from '../kiri/init.js';

console.log('KIRI V2');

function checkReady() {
    if (document.readyState === 'complete') {
        console.trace('READY!');
        run();
    }
}

// when dom + scripts complete
document.onreadystatechange = checkReady;

checkReady();