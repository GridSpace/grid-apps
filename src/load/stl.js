/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';

const CDH = 'Content-Disposition';
const { Vector3, computeFaceNormal } = THREE;

/**
 * Encode vertex array(s) to binary STL format
 * Automatically computes normals from triangle vertices
 * @param {Array} recs - array of {file: string, varr: Float32Array} records
 * @param {String} header - optional header text (max 80 chars)
 * @returns {Uint8Array} binary STL data
 */
export function encode(recs, header = '') {
    // Calculate total vertices
    let vtot = 0;
    for (let rec of recs) {
        vtot += (rec.varr.length / 3);
    }

    // Create STL buffer: 80 byte header + 4 byte count + (50 bytes per triangle)
    let stl = new Uint8Array(80 + 4 + vtot/3 * 50);
    let dat = new DataView(stl.buffer);
    let pos = 84;

    // Write header text (first 80 bytes)
    if (header) {
        header.substring(0, 80).split('').forEach((c, i) => {
            dat.setUint8(i, c.charCodeAt(0));
        });
    }

    // Write triangle count at byte 80
    dat.setInt32(80, vtot/3, true);

    // Write triangles
    for (let rec of recs) {
        let { varr } = rec;
        for (let i = 0, l = varr.length; i < l;) {
            // Read three vertices
            let p0 = new Vector3(varr[i++], varr[i++], varr[i++]);
            let p1 = new Vector3(varr[i++], varr[i++], varr[i++]);
            let p2 = new Vector3(varr[i++], varr[i++], varr[i++]);

            // Compute face normal
            let norm = computeFaceNormal(p0, p1, p2);

            // Write normal (3 floats)
            dat.setFloat32(pos +  0, norm.x, true);
            dat.setFloat32(pos +  4, norm.y, true);
            dat.setFloat32(pos +  8, norm.z, true);

            // Write vertices (9 floats)
            dat.setFloat32(pos + 12, p0.x, true);
            dat.setFloat32(pos + 16, p0.y, true);
            dat.setFloat32(pos + 20, p0.z, true);
            dat.setFloat32(pos + 24, p1.x, true);
            dat.setFloat32(pos + 28, p1.y, true);
            dat.setFloat32(pos + 32, p1.z, true);
            dat.setFloat32(pos + 36, p2.x, true);
            dat.setFloat32(pos + 40, p2.y, true);
            dat.setFloat32(pos + 44, p2.z, true);

            // Attribute byte count (2 bytes) - typically 0
            dat.setUint16(pos + 48, 0, true);

            pos += 50;
        }
    }

    return stl;
}

export class STL {
    constructor() {
        this.vertices = null;
        this.normals = null;
        this.colors = null;
    }

    load(url, callback, formdata, scale, credentials, headers) {
        const stl = this;

        fetch(url, {
            method: formdata ? 'POST' : 'GET',
            credentials: credentials ? credentials : 'same-origin',
            body: formdata,
            ...(headers ? { headers: headers } : {})
        }).then(response => {
            if (response.status === 200 || response.status === 0) {
                response.arrayBuffer().then(buffer => {
                    stl.parse(buffer, scale);

                    let cdhVal = response.headers.get(CDH);
                    if (typeof cdhVal === "string") {
                        cdhVal = cdhVal.split(';').map(v => v.trim()).filter(v => {
                            return v.indexOf('filename=') === 0;
                        }).map(v => {
                            return v.substring(10, v.length - 1);
                        })[0];
                    }
                    if (callback) callback(stl.vertices, cdhVal);
                });
            } else {
                if (callback) callback(null, response.statusText);
            }
        }).catch(err => {
            if (callback) callback(null, err)
        });
    }

    encode(vertices, normals) {
        if (!(vertices && vertices.length % 3 === 0)) throw "invalid vertices";

        let vc = vertices.length / 3,
            bs = (vc * 16) + (vc * (2 / 3)) + 84,
            bin = new ArrayBuffer(bs),
            writer = new DataView(bin),
            i = 0,
            j = 0,
            pos = 80;

        function writeInt16(val) {
            writer.setUint16(pos, val, true);
            pos += 2;
        }

        function writeInt32(val) {
            writer.setUint32(pos, val, true);
            pos += 4;
        }

        function writeFloat(val) {
            writer.setFloat32(pos, val, true);
            pos += 4;
        }

        function writeVertex() {
            writeFloat(vertices[i++]); // x
            writeFloat(vertices[i++]); // y
            writeFloat(vertices[i++]); // z
        }

        writeInt32(vc / 3);
        while (i < vertices.length) {
            writeFloat(normals ? normals[j++] : 0); // norm x
            writeFloat(normals ? normals[j++] : 0); // norm y
            writeFloat(normals ? normals[j++] : 0); // norm z
            writeVertex(); // p1
            writeVertex(); // p2
            writeVertex(); // p3
            writeInt16(0); // attributes
        }

        return bin;
    }

    parse(data, scale) {
        let binData = this.convertToBinary(data);

        let isBinary = function () {
            let expect, face_size, n_faces, reader;
            reader = new DataView(binData);
            face_size = (32 / 8 * 3) + ((32 / 8 * 3) * 3) + (16 / 8);
            n_faces = reader.getUint32(80, true);
            expect = 80 + (32 / 8) + (n_faces * face_size);
            return expect === reader.byteLength;
        };

        return isBinary()
            ? this.parseBinary(binData, scale)
            : this.parseASCII(this.convertToString(data), scale);
    }

    parseAsync(data, scale) {
        return new Promise((resolve, reject) => {
            resolve(this.parse(data, scale));
        });
    }

    parseBinary(data, scale = 1) {
        let reader = new DataView(data),
            faces = reader.getUint32(80, true),
            r, g, b, hasColors = false, colors,
            defaultR, defaultG, defaultB, alpha;

        // check for default color in STL header ("COLOR=rgba" sequence).
        for (let index = 0; index < 80 - 10; index++) {
            if ((reader.getUint32(index, false) == 0x434F4C4F /*COLO*/) &&
                (reader.getUint8(index + 4) == 0x52 /*'R'*/) &&
                (reader.getUint8(index + 5) == 0x3D /*'='*/)) {
                hasColors = true;
                colors = new Float32Array(faces * 3 * 3);
                defaultR = reader.getUint8(index + 6) / 255;
                defaultG = reader.getUint8(index + 7) / 255;
                defaultB = reader.getUint8(index + 8) / 255;
                alpha = reader.getUint8(index + 9) / 255;
            }
        }

        let offset = 0,
            dataOffset = 84,
            faceLength = 12 * 4 + 2,
            vertices = new Float32Array(faces * 3 * 3),
            normals = new Float32Array(faces * 3 * 3);

        colors = hasColors ? new Uint16Array(faces * 3 * 3) : null;

        for (let face = 0; face < faces; face++) {

            let start = dataOffset + face * faceLength,
                normalX = reader.getFloat32(start, true),
                normalY = reader.getFloat32(start + 4, true),
                normalZ = reader.getFloat32(start + 8, true);

            if (hasColors) {
                let packedColor = reader.getUint16(start + 48, true);
                if ((packedColor & 0x8000) === 0) { // facet has its own unique color
                    r = (packedColor & 0x1F) / 31;
                    g = ((packedColor >> 5) & 0x1F) / 31;
                    b = ((packedColor >> 10) & 0x1F) / 31;
                } else {
                    r = defaultR;
                    g = defaultG;
                    b = defaultB;
                }
            }

            let i = 1, vertexstart;

            while (i <= 3) {
                vertexstart = start + (i++) * 12;
                vertices[offset] = reader.getFloat32(vertexstart, true) * scale;
                vertices[offset + 1] = reader.getFloat32(vertexstart + 4, true) * scale;
                vertices[offset + 2] = reader.getFloat32(vertexstart + 8, true) * scale;
                normals[offset] = normalX;
                normals[offset + 1] = normalY;
                normals[offset + 2] = normalZ;
                if (hasColors) {
                    colors[offset] = r;
                    colors[offset + 1] = g;
                    colors[offset + 2] = b;
                }
                offset += 3;
            }
        }

        this.vertices = vertices;
        this.normals = normals;
        this.colors = colors;

        return vertices;
    }

    parseASCII(data, scale = 1) {
        let result,
            resultText,
            patternNormal,
            patternVertex,
            vertices = [],
            normals = [],
            patternFace = /facet([\s\S]*?)endfacet/g;

        while ((result = patternFace.exec(data)) !== null) {
            resultText = result[0];
            patternNormal = /normal[\s]+([\-+]?[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+/g;
            patternVertex = /vertex[\s]+([\-+]?[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+/g;
            while ((result = patternNormal.exec(resultText)) !== null) {
                normals.push(parseFloat(result[1]));
                normals.push(parseFloat(result[3]));
                normals.push(parseFloat(result[5]));
            }
            while ((result = patternVertex.exec(resultText)) !== null) {
                vertices.push(parseFloat(result[1]) * scale);
                vertices.push(parseFloat(result[3]) * scale);
                vertices.push(parseFloat(result[5]) * scale);
            }
        }

        let vToFloat32 = new Float32Array(vertices.length),
            nToFloat32 = new Float32Array(normals.length),
            i;

        for (i = 0; i < vertices.length; i++) vToFloat32[i] = vertices[i];
        for (i = 0; i < normals.length; i++) nToFloat32[i] = normals[i];

        this.vertices = vToFloat32;
        this.normals = nToFloat32;

        return vToFloat32;
    }

    convertToString(buf) {
        if (typeof buf !== "string") {
            let array_buffer = new Uint8Array(buf);
            let str = '';
            for (let i = 0; i < buf.byteLength; i++) {
                str += String.fromCharCode(array_buffer[i]);
            }
            return str;
        } else {
            return buf;
        }
    }

    convertToBinary(buf) {
        if (typeof buf === "string") {
            let array_buffer = new Uint8Array(buf.length);
            for (let i = 0; i < buf.length; i++) {
                array_buffer[i] = buf.charCodeAt(i) & 0xff;
            }
            return array_buffer.buffer || array_buffer;
        } else {
            return buf;
        }
    }
}
