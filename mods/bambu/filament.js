self.kiri.load(api => {

let list = [
    ["GFB00", "Bambu ABS"],
    ["GFB50", "Bambu ABS-GF"],
    ["GFB01", "Bambu ASA"],
    ["GFB02", "Bambu ASA-Aero"],
    ["GFB51", "Bambu ASA-CF"],
    ["GFN03", "Bambu PA-CF"],
    ["GFN05", "Bambu PA6-CF"],
    ["GFN08", "Bambu PA6-GF"],
    ["GFN04", "Bambu PAHT-CF"],
    ["GFC01", "Bambu PC FR"],
    ["GFC00", "Bambu PC"],
    ["GFT01", "Bambu PET-CF"],
    ["GFG00", "Bambu PETG Basic"],
    ["GFG02", "Bambu PETG HF"],
    ["GFG01", "Bambu PETG Translucent"],
    ["GFG50", "Bambu PETG-CF"],
    ["GFA11", "Bambu PLA Aero"],
    ["GFA00", "Bambu PLA Basic"],
    ["GFA13", "Bambu PLA Dynamic"],
    ["GFA15", "Bambu PLA Galaxy"],
    ["GFA12", "Bambu PLA Glow"],
    ["GFA07", "Bambu PLA Marble"],
    ["GFA01", "Bambu PLA Matte"],
    ["GFA02", "Bambu PLA Metal"],
    ["GFA05", "Bambu PLA Silk"],
    ["GFA06", "Bambu PLA Silk+"],
    ["GFA08", "Bambu PLA Sparkle"],
    ["GFA09", "Bambu PLA Tough"],
    ["GFA16", "Bambu PLA Wood"],
    ["GFA50", "Bambu PLA-CF"],
    ["GFN06", "Bambu PPA-CF"],
    ["GFT02", "Bambu PPS-CF"],
    ["GFS04", "Bambu PVA"],
    ["GFS03", "Bambu Support For PA/PET"],
    ["GFS02", "Bambu Support For PLA"],
    ["GFS05", "Bambu Support For PLA/PETG"],
    ["GFS01", "Bambu Support G"],
    ["GFS00", "Bambu Support W"],
    ["GFS06", "Bambu Support for ABS"],
    ["GFU00", "Bambu TPU 95A HF"],
    ["GFU01", "Bambu TPU 95A"],
    ["GFU02", "Bambu TPU for AMS"],
    ["GFL52", "Fiberon PA12-CF"],
    ["GFL50", "Fiberon PA6-CF"],
    ["GFL51", "Fiberon PA6-GF"],
    ["GFL53", "Fiberon PA612-CF"],
    ["GFL54", "Fiberon PET-CF"],
    ["GFL06", "Fiberon PETG-ESD"],
    ["GFL55", "Fiberon PETG-rCF"],
    ["GFB99", "Generic ABS"],
    ["GFB98", "Generic ASA"],
    ["GFS97", "Generic BVOH"],
    ["GFR99", "Generic EVA"],
    ["GFS98", "Generic HIPS"],
    ["GFN99", "Generic PA"],
    ["GFN98", "Generic PA-CF"],
    ["GFC99", "Generic PC"],
    ["GFG97", "Generic PCTG"],
    ["GFP99", "Generic PE"],
    ["GFP98", "Generic PE-CF"],
    ["GFG96", "Generic PETG HF"],
    ["GFG99", "Generic PETG"],
    ["GFG98", "Generic PETG-CF"],
    ["GFR98", "Generic PHA"],
    ["GFL95", "Generic PLA High Speed"],
    ["GFL96", "Generic PLA Silk"],
    ["GFL99", "Generic PLA"],
    ["GFL98", "Generic PLA-CF"],
    ["GFP97", "Generic PP"],
    ["GFP96", "Generic PP-CF"],
    ["GFP95", "Generic PP-GF"],
    ["GFN97", "Generic PPA-CF"],
    ["GFN96", "Generic PPA-GF"],
    ["GFT97", "Generic PPS"],
    ["GFT98", "Generic PPS-CF"],
    ["GFS99", "Generic PVA"],
    ["GFU98", "Generic TPU for AMS"],
    ["GFU99", "Generic TPU"],
    ["GFL05", "Overture Matte PLA"],
    ["GFL04", "Overture PLA"],
    ["GFB60", "PolyLite ABS"],
    ["GFB61", "PolyLite ASA"],
    ["GFG60", "PolyLite PETG"],
    ["GFL00", "PolyLite PLA"],
    ["GFL01", "PolyTerra PLA"],
    ["GFL03", "eSUN PLA+"]
];

let map = {};

for (let row of list) {
    map[row[0]] = row[1];
}

api.bambu.filament = {
    list, map
};

});