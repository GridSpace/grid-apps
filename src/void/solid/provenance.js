/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function buildSeedProvenance(feature, profileTarget, bodyIndex = 0) {
    return {
        source: {
            feature_id: feature?.id || null,
            feature_type: feature?.type || null,
            profile: profileTarget || null
        },
        faces: [
            { role: 'cap_start', source: profileTarget || null },
            { role: 'cap_end', source: profileTarget || null },
            { role: 'side', source: profileTarget || null }
        ],
        body_index: bodyIndex
    };
}

export {
    buildSeedProvenance
};

