/**
 * adapted from THREE.STL-LOADER example
 *
 * https://en.wikipedia.org/wiki/STL_(file_format)
 */
'use strict';

(function() {

    /**
     * @constructor
     */
    function STL() {
        this.vertices = null;
        this.normals = null;
        this.colors = null;
    }

    var SP = STL.prototype;

    if (!self.moto) self.moto = {};

    self.moto.STL = STL;

    SP.load = function(url, callback) {
        var stl = this,
            xhr = new XMLHttpRequest();

        function onloaded (event)  {
            if (event.target.status === 200 || event.target.status === 0)  {
                stl.parse(event.target.response || event.target.responseText);
                if (callback) callback(stl.vertices);
            } else {
                if (callback) callback(null, event.target.statusText);
            }
        }

        xhr.addEventListener('load', onloaded, false);
        xhr.addEventListener('progress', function (event)  { }, false);
        xhr.addEventListener('error', function () { }, false);

        if (xhr.overrideMimeType) {
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
        }

        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
    };

    SP.encode = function(vertices, normals) {
        if (!(vertices && vertices.length % 3 === 0)) throw "invalid vertices";

        var vc = vertices.length / 3,
            bs = (vc * 16) + (vc * (2/3)) + 84,
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
    };

    SP.parse = function(data) {
        var binData = this.convertToBinary(data);

        var isBinary = function () {
            var expect, face_size, n_faces, reader;
            reader = new DataView(binData);
            face_size = (32 / 8 * 3) + ((32 / 8 * 3) * 3) + (16 / 8);
            n_faces = reader.getUint32(80,true);
            expect = 80 + (32 / 8) + (n_faces * face_size);
            return expect === reader.byteLength;
        };

        return isBinary()
            ? this.parseBinary(binData)
            : this.parseASCII(this.convertToString(data));
    };

    SP.parseBinary = function(data)  {
        var reader = new DataView(data),
            faces = reader.getUint32 (80, true),
            r, g, b, hasColors = false, colors,
            defaultR, defaultG, defaultB, alpha;

        // check for default color in STL header ("COLOR=rgba" sequence).
        for (var index = 0; index < 80 - 10; index++) {
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

        var offset = 0,
            dataOffset = 84,
            faceLength = 12 * 4 + 2,
            vertices = new Float32Array(faces * 3 * 3),
            normals = new Float32Array(faces * 3 * 3),
            colors = hasColors ? new Uint16Array(faces * 3 * 3) : null;

        for (var face = 0; face < faces; face ++)  {

            var start = dataOffset + face * faceLength,
                normalX = reader.getFloat32(start, true),
                normalY = reader.getFloat32(start + 4, true),
                normalZ = reader.getFloat32(start + 8, true);

            if (hasColors) {
                var packedColor = reader.getUint16(start + 48, true);
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

            var i = 1, vertexstart;

            while (i <= 3)  {
                vertexstart = start + (i++) * 12;
                vertices[offset    ] = reader.getFloat32 (vertexstart, true);
                vertices[offset + 1] = reader.getFloat32 (vertexstart + 4, true);
                vertices[offset + 2] = reader.getFloat32 (vertexstart + 8, true);
                 normals[offset    ] = normalX;
                 normals[offset + 1] = normalY;
                 normals[offset + 2] = normalZ;
                if (hasColors) {
                    colors[offset    ] = r;
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
    };

    SP.parseASCII = function(data) {
        var result,
            resultText,
            patternNormal,
            patternVertex,
            vertices = [],
            normals = [],
            patternFace = /facet([\s\S]*?)endfacet/g;

        while ((result = patternFace.exec(data)) !== null)  {
            resultText = result[0];
            patternNormal = /normal[\s]+([\-+]?[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+/g;
            patternVertex = /vertex[\s]+([\-+]?[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+/g;
            while ((result = patternNormal.exec(resultText)) !== null) {
                normals.push(parseFloat(result[1]));
                normals.push(parseFloat(result[3]));
                normals.push(parseFloat(result[5]));
            }
            while ((result = patternVertex.exec(resultText)) !== null) {
                vertices.push(parseFloat(result[1]));
                vertices.push(parseFloat(result[3]));
                vertices.push(parseFloat(result[5]));
            }
        }

        var vToFloat32 = new Float32Array(vertices.length),
            nToFloat32 = new Float32Array(normals.length),
            i;

        for (i=0; i<vertices.length; i++) vToFloat32[i] = vertices[i];
        for (i=0; i<normals.length; i++) nToFloat32[i] = normals[i];

        this.vertices = vToFloat32;
        this.normals = nToFloat32;

        return vToFloat32;
    };

    SP.convertToString = function (buf) {
        if (typeof buf !== "string") {
            var array_buffer = new Uint8Array(buf);
            var str = '';
            for (var i = 0; i < buf.byteLength; i++) {
                str += String.fromCharCode(array_buffer[i]);
            }
            return str;
        } else {
            return buf;
        }
    };

    SP.convertToBinary = function (buf) {
        if (typeof buf === "string") {
            var array_buffer = new Uint8Array(buf.length);
            for (var i = 0; i < buf.length; i++) {
                array_buffer[i] = buf.charCodeAt(i) & 0xff;
            }
            return array_buffer.buffer || array_buffer;
        } else {
            return buf;
        }
    };

})();
