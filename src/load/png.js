/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// use: ext.pngjs
gapp.register("load.png", (root, exports) => {

const { load } = root;

load.PNG = {
    parseAsync,
    parse
};

function parseAsync(bin, opt) {
    return new Promise((resolve,reject) => {
        parse(bin, {
            ...opt,
            done(vertices) { resolve(vertices) }
        });
    });
}

/**
 * opt.outWidth = target output width in mm
 * opt.outHeight = target output height in mm
 * opt.inv_image = invert image data 255 - depth
 * opt.inv_alpha = invert alpha interp 255 - alpha
 * opt.border = border thickness in mm
 * opt.blur = blur value in mm
 * opt.base = base added thickness in mm
 */
function parse(bin, opt = {}) {
    let img = new png.PNG();
    let progress = opt.progress || noop;
    let ondone = opt.done || noop;
    img.parse(bin, (err, output) => {
        let { width, height, data } = output;
        // let { outHeight, outWidth } = opt;
        let outHeight = opt.outHeight || height;
        let outWidth = opt.outWidth || width;
        let imageAspect = height / width;
        let deviceAspect = outHeight / outWidth;
        let div = 1;
        if (imageAspect < deviceAspect) {
            div = width / outWidth;
        } else {
            div = height / outHeight;
        }
        let points =
            width * height + // grid
            height * 2 + 0 + // left/right
            width * 2 + 0;   // top/bottom
        let flats =
            ((height-1) * (width-1)) + // surface
            ((height-1) * 2) +         // left/right
            ((width-1) * 2) +          // top/bottom
            1;                         // base
        // convert png to grayscale
        let gray = new Uint8Array(width * height);
        let alpha = new Uint8Array(width * height);
        let gi = 0;
        let invi = opt.inv_image ? true : false;
        let inva = opt.inv_alpha ? true : false;
        let border = opt.border || 0;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let di = (x + width * y) * 4;
                let r = data[di];
                let g = data[di+1];
                let b = data[di+2];
                let a = data[di+3];
                let v = ((r + g + b) / 3);
                if (inva) a = 255 - a;
                if (invi) v = 255 - v;
                if (border) {
                    if (x < border || y < border || x > width-border-1 || y > height-border-1) {
                        v = 255;
                    }
                }
                alpha[gi] = a;
                gray[gi++] = v * (a / 255);
            }
        }
        let blur = parseInt(opt.blur || 0);
        while (blur-- > 0) {
            let blur = new Uint8Array(width * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let xl = Math.max(x-1,0);
                    let xr = Math.min(x+1,width-1);
                    let yu = Math.max(y-1,0);
                    let yd = Math.min(y+1,height-1);
                    let id = x + width * y;
                    blur[id] = ((
                        gray[xl + (width * yu)] +
                        gray[x  + (width * yu)] +
                        gray[xr + (width * yu)] +
                        gray[xl + (width *  y)] +
                        gray[x  + (width *  y)] * 8 + // self
                        gray[xr + (width *  y)] +
                        gray[xl + (width * yd)] +
                        gray[x  + (width * yd)] +
                        gray[xr + (width * yd)]
                    ) / 16);
                }
            }
            gray = blur;
        }
        // create indexed mesh output
        let base = parseInt(opt.base || 0);
        let verts = new Float32Array(points * 3);
        let faces = new Uint32Array(flats * 6);
        let w2 = width / 2;
        let h2 = height / 2;
        let vi = 0;
        let ii = 0;
        let VI = 0;
        let VB = 0;
        // create surface vertices & faces
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                let id = x + width * y;
                let v = gray[id];
                // create vertex @ x,y
                verts[vi++] = (-w2 + x) / div;
                verts[vi++] = (h2 - y) / div;
                verts[vi++] = (v / 50) + (base * alpha[id] / 255);
                VI++;
                // create two surface faces on the rect between x-1,y-1 and x,y
                if (x > 0 && y > 0) {
                    let p1 = (x - 1) * height + (y - 0);
                    let p2 = (x - 0) * height + (y - 1);
                    let p3 = (x - 0) * height + (y - 0);
                    let p4 = (x - 1) * height + (y - 1);
                    faces[ii++] = p1;
                    faces[ii++] = p3;
                    faces[ii++] = p2;
                    faces[ii++] = p1;
                    faces[ii++] = p2;
                    faces[ii++] = p4;
                }
            }
            progress(x / width);
        }
        // create top vertices & faces
        VB = VI;
        let TL = VI;
        for (let x = 0; x < width; x++) {
            let y = 0;
            verts[vi++] = (-w2 + x) / div;
            verts[vi++] = (h2 - y) / div;
            verts[vi++] = 0;
            VI++;
            // create two top faces on the rect x-1,0, x,z
            if (x > 0) {
                let p1 = VB + (x - 1);
                let p2 = VB + (x - 0);
                let p3 = (x * height);
                let p4 = (x - 1) * height;
                faces[ii++] = p1;
                faces[ii++] = p3;
                faces[ii++] = p2;
                faces[ii++] = p1;
                faces[ii++] = p4;
                faces[ii++] = p3;
            }
        }
        // create bottom vertices & faces
        VB = VI;
        let BL = VI;
        for (let x = 0; x < width; x++) {
            let y = height - 1;
            verts[vi++] = (-w2 + x) / div;
            verts[vi++] = (h2 - y) / div;
            verts[vi++] = 0;
            VI++;
            // create two top faces on the rect x-1,0, x,z
            if (x > 0) {
                let p1 = VB + (x - 1);
                let p2 = VB + (x - 0);
                let p3 = (x * height) + y;
                let p4 = (x - 1) * height + y;
                faces[ii++] = p1;
                faces[ii++] = p2;
                faces[ii++] = p3;
                faces[ii++] = p1;
                faces[ii++] = p3;
                faces[ii++] = p4;
            }
        }
        // create left vertices & faces
        VB = VI;
        for (let y=0; y < height; y++) {
            let x = 0;
            verts[vi++] = (-w2 + x) / div;
            verts[vi++] = (h2 - y) / div;
            verts[vi++] = 0;
            VI++;
            // create two left faces on the rect y-1,0, y,z
            if (y > 0) {
                let p1 = VB + (y + 0);
                let p2 = VB + (y - 1);
                let p3 = 0 + (y - 1);
                let p4 = 0 + (y - 0);
                faces[ii++] = p1;
                faces[ii++] = p3;
                faces[ii++] = p2;
                faces[ii++] = p1;
                faces[ii++] = p4;
                faces[ii++] = p3;
            }
        }
        // create right vertices & faces
        VB = VI;
        let TR = VI;
        for (let y=0; y < height; y++) {
            let x = width - 1;
            verts[vi++] = (-w2 + x) / div;
            verts[vi++] = (h2 - y) / div;
            verts[vi++] = 0;
            VI++;
            // create two right faces on the rect y-1,0, y,z
            if (y > 0) {
                let p1 = VB + (y + 0);
                let p2 = VB + (y - 1);
                let p3 = (x * height) + (y - 1);
                let p4 = (x * height) + (y - 0);
                faces[ii++] = p1;
                faces[ii++] = p2;
                faces[ii++] = p3;
                faces[ii++] = p1;
                faces[ii++] = p3;
                faces[ii++] = p4;
            }
        }
        let BR = VI-1;
        // create base two faces
        faces[ii++] = TL;
        faces[ii++] = TR;
        faces[ii++] = BR;
        faces[ii++] = TL;
        faces[ii++] = BR;
        faces[ii++] = BL;
        // flatten for now until we support indexed mesh
        // throughout KM (widget, storage, decimation)
        let bigv = new Float32Array(ii * 3);
        let bgi = 0;
        for (let i=0; i<ii; i++) {
            let iv = faces[i] * 3;
            bigv[bgi++] = verts[iv];
            bigv[bgi++] = verts[iv+1];
            bigv[bgi++] = verts[iv+2];
        }
        // return ArrayBuffer
        ondone(bigv);
    });
}

});
