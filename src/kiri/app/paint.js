/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Paint overlay shaders for mesh painting functionality.
 *
 * Provides two implementations for visualizing painted regions on mesh surfaces:
 * 1. Simple uniform-based (up to ~256 paint points)
 * 2. Texture-based (unlimited paint points)
 *
 * Paint points are spheres defined by center position and radius.
 * The shader checks if each fragment falls within any paint sphere and
 * blends the paint color accordingly.
 *
 * PAINT POINT DATA STRUCTURE:
 * ---------------------------
 * Paint points must be an array of objects with this structure:
 *
 * {
 *   point: { x: number, y: number, z: number },  // World-space center of paint sphere
 *   radius: number                                // Sphere radius in mm
 * }
 *
 * Example:
 * const paintPoints = [
 *   { point: { x: 10.5, y: 20.3, z: 15.0 }, radius: 5.0 },
 *   { point: { x: 12.0, y: 21.0, z: 15.5 }, radius: 5.0 },
 *   ...
 * ];
 *
 * USAGE:
 * ------
 * // Initial setup - enable paint overlay:
 * widget._origMaterial = widget.mesh.material;
 * widget.mesh.material = widget.mesh.material.clone();
 * addPaintOverlayAuto(widget.mesh.material, paintPoints, new THREE.Color(0x4488ff));
 * widget.mesh.material.needsUpdate = true;
 *
 * // Real-time updates while painting (see updatePaintOverlay function below)
 *
 * // Cleanup - restore original material:
 * widget.mesh.material = widget._origMaterial;
 * delete widget._origMaterial;
 *
 * REAL-TIME UPDATES:
 * ------------------
 * When actively painting (user dragging mouse), paint points are added continuously.
 * Use updatePaintOverlay() to efficiently update the shader without recreating material:
 *
 * // Add new paint point
 * paintPoints.push({ point: { x, y, z }, radius: 5 });
 *
 * // Update shader to show new point immediately
 * updatePaintOverlay(widget.mesh.material, paintPoints);
 *
 * Note: After onBeforeCompile runs once, the shader program is compiled and cached.
 * Subsequent updates only need to update the uniform values, which is very fast.
 */

import { THREE } from '../../ext/three.js';

/**
 * Add paint overlay to material using uniform array storage.
 * Suitable for up to ~256 paint points (GPU uniform limit varies).
 *
 * Uses sphere-based distance checks to determine if a fragment is painted.
 * Paint color is blended at 50% opacity with the underlying material color.
 *
 * @param {THREE.Material} material - Material to modify (will be mutated via onBeforeCompile)
 * @param {Array<{point: {x,y,z}, radius: number}>} paintPoints - Array of paint spheres
 * @param {THREE.Color} [paintColor] - Color for painted regions (default: light blue)
 * @returns {THREE.Material} The modified material
 */
function addPaintOverlaySimple(material, paintPoints, paintColor = new THREE.Color(0x4488ff)) {
    material.onBeforeCompile = (shader) => {
        // Store shader reference for later updates
        material.userData.shader = shader;

        // Convert paint points to vec4 array (x, y, z, radius)
        const points = paintPoints.map(p =>
            new THREE.Vector4(p.point.x, p.point.y, p.point.z, p.radius)
        );

        // Add uniforms for paint data
        shader.uniforms.paintPoints = { value: points };
        shader.uniforms.paintCount = { value: points.length };
        shader.uniforms.paintColor = { value: paintColor };

        // Pass world position from vertex shader to fragment shader
        shader.vertexShader = shader.vertexShader.replace(
            `#include <worldpos_vertex>`,
            `
            #include <worldpos_vertex>
            vWorldPosition = vec3(transformed);
            `
        );

        shader.vertexShader = `
            varying vec3 vWorldPosition;
        ` + shader.vertexShader;

        // Fragment shader: check distance to each paint sphere
        shader.fragmentShader = `
            varying vec3 vWorldPosition;
            uniform vec4 paintPoints[256];  // (x, y, z, radius)
            uniform int paintCount;
            uniform vec3 paintColor;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `
            #include <dithering_fragment>

            // Check if this fragment is within any paint sphere
            bool painted = false;

            for (int i = 0; i < 256; i++) {
                if (i >= paintCount) break;

                vec3 center = paintPoints[i].xyz;
                float radius = paintPoints[i].w;
                float dist = distance(vWorldPosition, center);

                if (dist <= radius) {
                    painted = true;
                    break;  // Early exit once painted
                }
            }

            if (painted) {
                // Blend paint color with existing fragment color
                gl_FragColor.rgb = mix(gl_FragColor.rgb, paintColor, 0.5);
            }
            `
        );
    };

    return material;
}

/**
 * Add paint overlay using texture-based point storage.
 * Scales to unlimited paint points by encoding them in a DataTexture.
 *
 * Each texel in the data texture stores one paint point as RGBA float:
 * - R channel: x coordinate
 * - G channel: y coordinate
 * - B channel: z coordinate
 * - A channel: radius
 *
 * @param {THREE.Material} material - Material to modify (will be mutated via onBeforeCompile)
 * @param {Array<{point: {x,y,z}, radius: number}>} paintPoints - Array of paint spheres
 * @param {THREE.Color} [paintColor] - Color for painted regions (default: light blue)
 * @returns {THREE.Material} The modified material
 */
function addPaintOverlayTexture(material, paintPoints, paintColor = new THREE.Color(0x4488ff)) {
    material.onBeforeCompile = (shader) => {
        // Store shader reference for later updates
        material.userData.shader = shader;

        // Create data texture from paint points
        // Texture is laid out as square grid: width x height >= point count
        const pointCount = paintPoints.length;
        const texWidth = Math.ceil(Math.sqrt(pointCount));
        const texHeight = Math.ceil(pointCount / texWidth);
        const data = new Float32Array(texWidth * texHeight * 4);

        // Pack paint points into texture data
        // Each point = 4 floats (x, y, z, radius)
        for (let i = 0; i < paintPoints.length; i++) {
            const p = paintPoints[i];
            data[i * 4 + 0] = p.point.x;
            data[i * 4 + 1] = p.point.y;
            data[i * 4 + 2] = p.point.z;
            data[i * 4 + 3] = p.radius;
        }

        // Create texture with float data
        const texture = new THREE.DataTexture(
            data,
            texWidth,
            texHeight,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        texture.needsUpdate = true;

        // Add uniforms for paint data
        shader.uniforms.paintTexture = { value: texture };
        shader.uniforms.paintCount = { value: pointCount };
        shader.uniforms.paintTexSize = { value: new THREE.Vector2(texWidth, texHeight) };
        shader.uniforms.paintColor = { value: paintColor };

        // Pass world position from vertex shader to fragment shader
        shader.vertexShader = shader.vertexShader.replace(
            `#include <worldpos_vertex>`,
            `
            #include <worldpos_vertex>
            vWorldPosition = vec3(transformed);
            `
        );

        shader.vertexShader = `
            varying vec3 vWorldPosition;
        ` + shader.vertexShader;

        // Fragment shader: sample paint points from texture and check distances
        shader.fragmentShader = `
            varying vec3 vWorldPosition;
            uniform sampler2D paintTexture;
            uniform int paintCount;
            uniform vec2 paintTexSize;
            uniform vec3 paintColor;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `
            #include <dithering_fragment>

            bool painted = false;

            // Iterate through paint points stored in texture
            // Loop limit must be constant, but we break early when i >= paintCount
            for (int i = 0; i < 10000; i++) {
                if (i >= paintCount) break;

                // Calculate texture coordinates for this point index
                // Points are stored row-major in the texture
                float u = (float(i % int(paintTexSize.x)) + 0.5) / paintTexSize.x;
                float v = (float(i / int(paintTexSize.x)) + 0.5) / paintTexSize.y;

                // Sample point data from texture (x, y, z, radius)
                vec4 pointData = texture2D(paintTexture, vec2(u, v));
                vec3 center = pointData.xyz;
                float radius = pointData.w;

                // Check if fragment is within this paint sphere
                float dist = distance(vWorldPosition, center);

                if (dist <= radius) {
                    painted = true;
                    break;  // Early exit once painted
                }
            }

            if (painted) {
                // Blend paint color with existing fragment color
                gl_FragColor.rgb = mix(gl_FragColor.rgb, paintColor, 0.5);
            }
            `
        );
    };

    return material;
}

/**
 * Helper function to choose appropriate paint overlay method based on point count.
 * Automatically selects simple or scalable version.
 *
 * @param {THREE.Material} material - Material to modify
 * @param {Array<{point: {x,y,z}, radius: number}>} paintPoints - Array of paint spheres
 * @param {THREE.Color} [paintColor] - Color for painted regions
 * @returns {THREE.Material} The modified material
 */
function addPaintOverlayAuto(material, paintPoints, paintColor = new THREE.Color(0x4488ff)) {
    if (paintPoints.length <= 256) {
        return addPaintOverlaySimple(material, paintPoints, paintColor);
    } else {
        return addPaintOverlayTexture(material, paintPoints, paintColor);
    }
}

/**
 * Update paint overlay with new paint points (for real-time painting).
 * Call this after adding new points to the paintPoints array.
 *
 * This function updates the shader uniforms without recompiling the shader,
 * making it suitable for real-time updates during mouse drag painting.
 *
 * IMPORTANT: The material must have already been initialized with one of the
 * addPaintOverlay functions before calling this update function.
 *
 * @param {THREE.Material} material - Material with paint shader already applied
 * @param {Array<{point: {x,y,z}, radius: number}>} paintPoints - Updated array of paint spheres
 */
function updatePaintOverlay(material, paintPoints) {
    // Access the compiled shader uniforms
    // After onBeforeCompile runs once, userData.shader contains the compiled program
    const shader = material.userData?.shader;

    if (!shader || !shader.uniforms) {
        console.warn('updatePaintOverlay: material does not have compiled paint shader');
        return;
    }

    // Determine which shader type based on available uniforms
    if (shader.uniforms.paintPoints) {
        // Simple uniform-based shader
        updatePaintOverlaySimple(shader, paintPoints);
    } else if (shader.uniforms.paintTexture) {
        // Texture-based shader
        updatePaintOverlayTexture(shader, paintPoints);
    } else {
        console.warn('updatePaintOverlay: unrecognized paint shader type');
    }
}

/**
 * Update simple uniform-based paint shader.
 * @private
 */
function updatePaintOverlaySimple(shader, paintPoints) {
    const uniforms = shader.uniforms;

    // Convert paint points to vec4 array (x, y, z, radius)
    const points = paintPoints.map(p =>
        new THREE.Vector4(p.point.x, p.point.y, p.point.z, p.radius)
    );

    // Update uniform values
    uniforms.paintPoints.value = points;
    uniforms.paintCount.value = points.length;

    // Note: No need to set needsUpdate on the material
    // Uniform updates are automatically detected by THREE.js
}

/**
 * Update texture-based paint shader.
 * @private
 */
function updatePaintOverlayTexture(shader, paintPoints) {
    const uniforms = shader.uniforms;

    // Recreate texture with new paint points
    const pointCount = paintPoints.length;
    const texWidth = Math.ceil(Math.sqrt(pointCount));
    const texHeight = Math.ceil(pointCount / texWidth);
    const data = new Float32Array(texWidth * texHeight * 4);

    // Pack paint points into texture data
    for (let i = 0; i < paintPoints.length; i++) {
        const p = paintPoints[i];
        data[i * 4 + 0] = p.point.x;
        data[i * 4 + 1] = p.point.y;
        data[i * 4 + 2] = p.point.z;
        data[i * 4 + 3] = p.radius;
    }

    // Create new texture
    const texture = new THREE.DataTexture(
        data,
        texWidth,
        texHeight,
        THREE.RGBAFormat,
        THREE.FloatType
    );
    texture.needsUpdate = true;

    // Dispose old texture to prevent memory leak
    if (uniforms.paintTexture.value) {
        uniforms.paintTexture.value.dispose();
    }

    // Update uniform values
    uniforms.paintTexture.value = texture;
    uniforms.paintCount.value = pointCount;
    uniforms.paintTexSize.value.set(texWidth, texHeight);
}

export {
    addPaintOverlaySimple,
    addPaintOverlayTexture,
    addPaintOverlayAuto,
    updatePaintOverlay
};
