/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// Import the original PNG library
import './pngjs.js';

// Re-export the PNG object
export const PNG = globalThis.png ? globalThis.png.PNG : null;