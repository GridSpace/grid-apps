/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../ext/three.js';

/**
 * 3D Bitmap Text Renderer using font atlas.
 * Creates a texture atlas from specified characters and renders text using
 * individual character meshes with shared geometries and material.
 */
class Text3D {
    /**
     * Create a 3D text renderer.
     * @param {object} options - Configuration options
     * @param {string} options.chars - Characters to include in atlas (default: '0123456789-XY')
     * @param {number} options.atlasCharSize - Size of each character in atlas texture (default: 64)
     * @param {number} options.kerning - Character spacing multiplier (default: 0.5, lower = tighter)
     * @param {string} options.fontFamily - CSS font family string (default: 'Russo One, sans-serif')
     */
    constructor(options = {}) {
        this.chars = options.chars || '0123456789-XY';
        this.atlasCharSize = options.atlasCharSize || 64;
        this.kerning = options.kerning !== undefined ? options.kerning : 0.5;
        this.fontFamily = options.fontFamily || "'Russo One', sans-serif";

        this.atlas = null;
        this.geometries = {}; // Cached geometries per character
        this.material = null; // Shared material for all characters

        this._initialize();
    }

    /**
     * Initialize atlas, geometries, and material.
     * @private
     */
    _initialize() {
        this._createAtlas();
        this._createGeometries();
        this._createMaterial();
    }

    /**
     * Create bitmap font atlas texture.
     * @private
     */
    _createAtlas() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const charSize = this.atlasCharSize;

        canvas.width = charSize * this.chars.length;
        canvas.height = charSize;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `bold ${charSize * 0.8}px ${this.fontFamily}`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const uvMap = {};
        for (let i = 0; i < this.chars.length; i++) {
            const char = this.chars[i];
            ctx.fillText(char, i * charSize + charSize/2, charSize/2);
            uvMap[char] = {
                uStart: i / this.chars.length,
                uEnd: (i + 1) / this.chars.length
            };
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        this.atlas = { texture, uvMap, canvas };

        if (self.debug) {
            console.log('Text3D atlas created', {
                width: canvas.width,
                height: canvas.height,
                chars: this.chars.length
            });
        }
    }

    /**
     * Create cached geometries for each character.
     * Each character gets one geometry with UVs mapped to atlas position.
     * These geometries are reused across all labels.
     * @private
     */
    _createGeometries() {
        const { uvMap } = this.atlas;

        for (let char of this.chars) {
            const uvData = uvMap[char];
            if (!uvData) continue;

            // Create unit-sized plane (will be scaled when used)
            const geometry = new THREE.PlaneGeometry(1, 1);
            const uvAttr = geometry.attributes.uv;

            // Set UV coordinates to sample this character from atlas
            uvAttr.setXY(0, uvData.uStart, 0); // bottom-left
            uvAttr.setXY(1, uvData.uEnd, 0);   // bottom-right
            uvAttr.setXY(2, uvData.uStart, 1); // top-left
            uvAttr.setXY(3, uvData.uEnd, 1);   // top-right

            this.geometries[char] = geometry;
        }
    }

    /**
     * Create shared material for all characters.
     * @private
     */
    _createMaterial() {
        this.material = new THREE.MeshBasicMaterial({
            map: this.atlas.texture,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    /**
     * Create a 3D text label.
     * @param {string} text - Text to render
     * @param {number} size - Character height in world units
     * @param {string|number} color - Text color (CSS string or hex number)
     * @param {string} align - Horizontal alignment ('left', 'center', 'right')
     * @param {number} kerning - Optional kerning override for this label
     * @returns {THREE.Group} Group containing character meshes
     */
    createLabel(text, size, color = 0x333333, align = 'center', kerning) {
        const group = new THREE.Group();
        const spacing = kerning !== undefined ? kerning : this.kerning;
        const charWidth = size * spacing;
        const totalWidth = text.length * charWidth;

        // Convert CSS color string to THREE.Color if needed
        let threeColor = color;
        if (typeof color === 'string') {
            threeColor = new THREE.Color(color);
        }

        // Calculate starting X based on alignment
        let startX = 0;
        if (align === 'center') {
            startX = -totalWidth / 2;
        } else if (align === 'right') {
            startX = -totalWidth;
        }

        // Create mesh for each character using cached geometry
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const geometry = this.geometries[char];

            if (!geometry) {
                if (self.debug) {
                    console.warn('Text3D: Character not in atlas:', char);
                }
                continue;
            }

            // Clone material to set per-label color
            const material = this.material.clone();
            material.color = threeColor;

            const mesh = new THREE.Mesh(geometry, material);

            // Scale and position the unit-sized geometry
            mesh.scale.set(charWidth, size, 1);
            mesh.position.x = startX + i * charWidth + charWidth / 2;

            group.add(mesh);
        }

        return group;
    }

    /**
     * Update kerning for future labels.
     * @param {number} kerning - New kerning value
     */
    setKerning(kerning) {
        this.kerning = kerning;
    }

    /**
     * Clean up resources.
     */
    dispose() {
        // Dispose texture
        if (this.atlas && this.atlas.texture) {
            this.atlas.texture.dispose();
        }

        // Dispose geometries
        for (let char in this.geometries) {
            this.geometries[char].dispose();
        }

        // Dispose material
        if (this.material) {
            this.material.dispose();
        }
    }
}

export { Text3D };
