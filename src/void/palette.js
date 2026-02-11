/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const VOID_PALETTE = {
    sketch: {
        planeDefault: { fill: 0x5a9fd4, fillOpacity: 0.1, outline: 0x5a9fd4, outlineOpacity: 0.65 },
        planeHover: { fill: 0xff9933, fillOpacity: 0.14, outline: 0xff9933, outlineOpacity: 0.95 },
        planeEdit: { fill: 0x9ec7ff, fillOpacity: 0.08, outline: 0x5a9fd4, outlineOpacity: 0.9 },
        linesGray: 0x8f8f8f,
        linesHover: 0xff9933,
        linesEdit: 0xffffff,
        linesSelected: 0x9ec7ff,
        linesProjectedFace: 0x5a9fd4,
        linesDerivedActual: 0xff9933,
        linesMirrorAxis: 0xb07cff,
        pointsGray: 0x8f8f8f,
        pointsHover: 0xff9933,
        pointsEdit: 0xffffff,
        pointsSelected: 0x9ec7ff,
        pointsDerivedActual: 0xff9933,
        profileFillDefault: 0x8f8f8f,
        profileFillHover: 0xff9933,
        profileFillSelected: 0x5a9fd4,
        profileOpacityDefault: 0.18,
        profileOpacityHover: 0.24,
        profileOpacitySelected: 0.28,
        constraintGlyphDriven: 0x8e8e8e,
        constraintGlyphDerived: 0xc6c6c6,
        labelDefault: '#8f8f8f',
        labelHover: '#ff9933',
        labelEdit: '#a7cbff',
        lineWidths: {
            default: 1.2,
            hover: 3.0,
            selected: 3.4
        }
    },
    viewcube: {
        faces: {
            front: 0x4a9eff,
            back: 0x4a9eff,
            right: 0xff4a4a,
            left: 0xff4a4a,
            top: 0x4aff4a,
            bottom: 0x4aff4a
        },
        hover: 0xffaa33,
        edge: 0x000000
    }
};

export { VOID_PALETTE };
