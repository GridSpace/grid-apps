/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { newWidget } from './widget.js';
import { platform } from './platform.js';
import { settings } from './conf/manager.js';

/**
 * Show image import dialog with conversion options.
 * Prompts for blur, inversion, base size, and border settings.
 * Large images (>2.5MB) show a warning before proceeding.
 * @param {ArrayBuffer} image - PNG image data
 * @param {string} name - Filename
 * @param {boolean} [force] - Skip size warning if true
 */
function loadImageDialog(image, name, force) {
    if (!force && image.byteLength > 2500000) {
        return api.uc.confirm("Large images may fail to import<br>Consider resizing under 1000 x 1000<br>Proceed with import?").then(ok => {
            if (ok) {
                loadImageDialog(image, name, true);
            }
        });
    }
    const opt = {pre: [
        "<div class='f-col a-center'>",
        "  <h3>Image Conversion</h3>",
        "  <p class='t-just' style='width:300px;line-height:1.5em'>",
        "  This will create a 3D model from a 2D PNG image. Photos must",
        "  be blurred to be usable. Values from 0=off to 50=high are suggested.",
        "  Higher values incur more processing time.",
        "  </p>",
        "  <div class='f-row t-right'><table>",
        "  <tr><th>blur value</th><td><input id='png-blur' value='0' size='3'></td>",
        "      <th>&nbsp;invert image</th><td><input id='png-inv' type='checkbox'></td></tr>",
        "  <tr><th>base size</th><td><input id='png-base' value='0' size='3'></td>",
        "      <th>&nbsp;invert alpha</th><td><input id='alpha-inv' type='checkbox'></td></tr>",
        "  <tr><th>border size</th><td><input id='png-border' value='0' size='3'></td>",
        "      <th></th><td></td></tr>",
        "  </table></div>",
        "</div>"
    ]};
    api.uc.confirm(undefined, {convert:true, cancel:false}, undefined, opt).then((ok) => {
        if (ok) {
            loadImage(image, {
                file: name,
                blur: parseInt($('png-blur').value) || 0,
                base: parseInt($('png-base').value) || 0,
                border: parseInt($('png-border').value) || 0,
                inv_image: $('png-inv').checked,
                inv_alpha: $('alpha-inv').checked
            });
        }
    });
}

/**
 * Convert PNG image to 3D mesh using worker.
 * Creates height map from pixel brightness and generates vertices.
 * @param {ArrayBuffer} image - PNG image data
 * @param {object} [opt={}] - Options: file, blur, base, border, inv_image, inv_alpha
 */
function loadImage(image, opt = {}) {
    const info = Object.assign({settings: settings.get(), png:image}, opt);
    api.client.image2mesh(info, progress => {
        api.show.progress(progress, "converting");
    }, vertices => {
        api.show.progress(0);
        const widget = newWidget().loadVertices(vertices);
        widget.meta.file = opt.file;
        platform.add(widget);
    });
}

/**
 * Convert any image format to PNG before loading.
 * Uses canvas to convert image blob to PNG data URL.
 * @param {ArrayBuffer} res - Image data in any format
 * @param {string} name - Filename
 */
function loadImageConvert(res, name) {
    let url = URL.createObjectURL(new Blob([res]));

    $('mod-any').innerHTML = `<img id="xsrc" src="${url}"><canvas id="xdst"></canvas>`;

    let img = $('xsrc');
    let can = $('xdst');

    img.onload = () => {
        can.width = img.width;
        can.height = img.height;
        let ctx = can.getContext('2d');
        ctx.drawImage(img, 0, 0);
        fetch(can.toDataURL()).then(r => r.arrayBuffer()).then(data => {
            loadImageDialog(data, name);
        });
    };
}

export const image = {
    dialog: loadImageDialog,
    convert: loadImageConvert
};
