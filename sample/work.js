console.log('--- kiri worker module start ---');

kiri.load(function(api) {
    console.log('--- kiri worker module started ---');

    // augment worker code here. for example,
    // to ovveride fdm extrusion calculations
    // kiri.driver.FDM.extrudeMM = function(dist, perMM, factor) {
    //     return dist * perMM * factor;
    // };

});
