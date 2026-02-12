/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';

function attachColorShim(material, key, fallbackHex = 0xffffff) {
    if (!material?.uniforms?.[key]) return;
    const uni = material.uniforms[key];
    const fallback = new THREE.Color(fallbackHex);
    material.color = {
        setHex(hex) {
            if (uni.value?.setHex) uni.value.setHex(hex);
            else uni.value = new THREE.Color(hex);
        },
        getHex() {
            if (uni.value?.getHex) return uni.value.getHex();
            if (uni.value?.isColor) return uni.value.getHex();
            return fallback.getHex();
        }
    };
}

function createShaderPointSymbol(opts = {}) {
    const size = Number(opts.sizePx || 14);
    const coreR = Number(opts.coreR || 0.17);
    const ringBlackR = Number(opts.ringBlackR || 0.23);
    const ringWhiteR = Number(opts.ringWhiteR || 0.29);
    const ringHighlightR = Number(opts.ringHighlightR || 0.36);
    const thickness = Number(opts.thickness || 0.028);
    const uniforms = {
        uSize: { value: size },
        uCoreColor: { value: new THREE.Color(opts.coreColor || 0x8f8f8f) },
        uRingBlackColor: { value: new THREE.Color(opts.ringBlackColor || 0x101010) },
        uRingWhiteColor: { value: new THREE.Color(opts.ringWhiteColor || 0xffffff) },
        uHighlightColor: { value: new THREE.Color(opts.highlightColor || 0xff9933) },
        uShowBaseRings: { value: Number(opts.showBaseRings === false ? 0 : 1) },
        uCoreR: { value: coreR },
        uRingBlackR: { value: ringBlackR },
        uRingWhiteR: { value: ringWhiteR },
        uRingHighlightR: { value: ringHighlightR },
        uThickness: { value: thickness },
        uHighlight: { value: Number(opts.highlight || 0) }
    };
    const mat = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        vertexShader: `
            uniform float uSize;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = uSize;
            }
        `,
        fragmentShader: `
            #include <common>
            uniform vec3 uCoreColor;
            uniform vec3 uRingBlackColor;
            uniform vec3 uRingWhiteColor;
            uniform vec3 uHighlightColor;
            uniform float uShowBaseRings;
            uniform float uCoreR;
            uniform float uRingBlackR;
            uniform float uRingWhiteR;
            uniform float uRingHighlightR;
            uniform float uThickness;
            uniform float uHighlight;
            uniform float uSize;

            float band(float r, float c, float w) {
                float d = abs(r - c);
                float aa = max(fwidth(r) * 1.5, 1.0 / max(8.0, uSize));
                return 1.0 - smoothstep(w, w + aa, d);
            }

            void main() {
                vec2 p = gl_PointCoord - vec2(0.5);
                float r = length(p);
                if (r > 0.5) discard;

                vec3 col = uCoreColor;
                float a = 0.0;

                float aa = max(fwidth(r) * 1.5, 1.0 / max(8.0, uSize));
                float core = 1.0 - smoothstep(uCoreR, uCoreR + aa, r);
                if (core > 0.001) {
                    col = uCoreColor;
                    a = max(a, core);
                }

                if (uShowBaseRings > 0.5) {
                    float blk = band(r, uRingBlackR, uThickness);
                    if (blk > 0.001) {
                        col = mix(col, uRingBlackColor, blk);
                        a = max(a, blk);
                    }

                    float wht = band(r, uRingWhiteR, uThickness);
                    if (wht > 0.001) {
                        col = mix(col, uRingWhiteColor, wht);
                        a = max(a, wht);
                    }
                }

                if (uHighlight > 0.5) {
                    float hi = band(r, uRingHighlightR, uThickness);
                    if (hi > 0.001) {
                        col = mix(col, uHighlightColor, hi);
                        a = max(a, hi);
                    }
                }

                if (a < 0.01) discard;
                gl_FragColor = vec4(col, a);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }
        `
    });
    attachColorShim(mat, 'uCoreColor', 0x8f8f8f);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const pts = new THREE.Points(geom, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    return { points: pts, material: mat, uniforms };
}

function createSketchPointMarker(x = 0, y = 0, opts = {}, colors = {}) {
    const marker = new THREE.Group();
    marker.position.set(x, y, 0);
    marker.renderOrder = 8;
    marker.userData._shaderPoint = true;

    const pickCore = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 16),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
    );
    pickCore.material.colorWrite = false;
    pickCore.userData.sketchPointPick = true;
    marker.add(pickCore);

    const sym = createShaderPointSymbol({
        sizePx: opts.virtualOrigin ? 15 : 13,
        coreColor: 0x8f8f8f,
        ringBlackColor: 0x101010,
        ringWhiteColor: 0xffffff,
        highlightColor: colors.linesHover || 0xff9933,
        coreR: 0.17,
        ringBlackR: 0.23,
        ringWhiteR: 0.29,
        ringHighlightR: 0.36,
        thickness: 0.028
    });
    marker.add(sym.points);
    const ringHighlight = {
        material: sym.material,
        color: {
            setHex(hex) {
                if (sym.uniforms.uHighlightColor.value?.setHex) sym.uniforms.uHighlightColor.value.setHex(hex);
            },
            getHex() {
                return sym.uniforms.uHighlightColor.value?.getHex?.() || 0xff9933;
            }
        },
        get visible() {
            return !!(sym.uniforms.uHighlight.value > 0.5);
        },
        set visible(v) {
            sym.uniforms.uHighlight.value = v ? 1 : 0;
        }
    };
    const ringWhite = {
        material: {
            color: {
                setHex(hex) {
                    if (sym.uniforms.uRingWhiteColor.value?.setHex) sym.uniforms.uRingWhiteColor.value.setHex(hex);
                },
                getHex() {
                    return sym.uniforms.uRingWhiteColor.value?.getHex?.() || 0xffffff;
                }
            },
            get depthTest() {
                return sym.material.depthTest;
            },
            set depthTest(v) {
                sym.material.depthTest = !!v;
            }
        }
    };
    const ringBlack = {
        material: {
            color: {
                setHex(hex) {
                    if (sym.uniforms.uRingBlackColor.value?.setHex) sym.uniforms.uRingBlackColor.value.setHex(hex);
                },
                getHex() {
                    return sym.uniforms.uRingBlackColor.value?.getHex?.() || 0x101010;
                }
            },
            get depthTest() {
                return sym.material.depthTest;
            },
            set depthTest(v) {
                sym.material.depthTest = !!v;
            }
        }
    };

    marker.userData._markerParts = {
        core: sym.points,
        ringBlack,
        ringWhite,
        ringBase: {
            material: sym.material,
            get visible() {
                return !!(sym.uniforms.uShowBaseRings.value > 0.5);
            },
            set visible(v) {
                sym.uniforms.uShowBaseRings.value = v ? 1 : 0;
            }
        },
        ringHighlight,
        ringOuter: { material: sym.material },
        ringInner: { material: sym.material }
    };
    marker.userData._isVirtualOrigin = !!opts.virtualOrigin;

    return marker;
}

function createArcCenterMarker(x = 0, y = 0, colors = {}) {
    const marker = createSketchPointMarker(x, y, {}, colors);
    marker.userData._isArcCenter = true;
    return marker;
}

export {
    createSketchPointMarker,
    createArcCenterMarker
};
