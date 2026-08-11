/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const DEVICE_FORMAT = {
    'Anycubic.Photon': 'photon',
    'Anycubic.Photon.S': 'photons'
};

export const SLA_FORMATS = {
    photon: {
        id: 'photon',
        ext: 'photon',
        proprietary: true,
        available: true
    },
    photons: {
        id: 'photons',
        ext: 'photons',
        proprietary: true,
        available: true
    },
    cxdlp: {
        id: 'cxdlp',
        ext: 'cxdlp',
        proprietary: true,
        available: true
    },
    vsla: {
        id: 'vsla',
        ext: 'vsla',
        proprietary: false,
        available: true,
        editableMachine: true
    },
    rsla: {
        id: 'rsla',
        ext: 'rsla',
        proprietary: false,
        available: true,
        editableMachine: true
    },
    ctb: {
        id: 'ctb',
        ext: 'ctb',
        proprietary: true,
        available: true,
        priority: 1,
        family: 'chitubox'
    },
    ctbe: {
        id: 'ctbe',
        ext: 'encrypted.ctb',
        proprietary: true,
        available: false,
        priority: 1,
        family: 'chitubox-encrypted'
    },
    goo: {
        id: 'goo',
        ext: 'goo',
        proprietary: true,
        available: true,
        priority: 2,
        family: 'goo'
    },
    prz: {
        id: 'prz',
        ext: 'prz',
        proprietary: true,
        available: true,
        priority: 2,
        family: 'goo'
    },
    pw0: {
        id: 'pw0',
        ext: 'pw0',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    },
    pwx: {
        id: 'pwx',
        ext: 'pwx',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    },
    pwmo: {
        id: 'pwmo',
        ext: 'pwmo',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pwma: {
        id: 'pwma',
        ext: 'pwma',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pwms: {
        id: 'pwms',
        ext: 'pwms',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pwmx: {
        id: 'pwmx',
        ext: 'pwmx',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pwmb: {
        id: 'pwmb',
        ext: 'pwmb',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pmsq: {
        id: 'pmsq',
        ext: 'pmsq',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    px6s: {
        id: 'px6s',
        ext: 'px6s',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm3: {
        id: 'pm3',
        ext: 'pm3',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm3n: {
        id: 'pm3n',
        ext: 'pm3n',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm3m: {
        id: 'pm3m',
        ext: 'pm3m',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm3r: {
        id: 'pm3r',
        ext: 'pm3r',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    dl2p: {
        id: 'dl2p',
        ext: 'dl2p',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pmx2: {
        id: 'pmx2',
        ext: 'pmx2',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    dlp: {
        id: 'dlp',
        ext: 'dlp',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm4m: {
        id: 'pm4m',
        ext: 'pm4m',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    },
    pm4u: {
        id: 'pm4u',
        ext: 'pm4u',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    },
    pm4n: {
        id: 'pm4n',
        ext: 'pm4n',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm5: {
        id: 'pm5',
        ext: 'pm5',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm5s: {
        id: 'pm5s',
        ext: 'pm5s',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    m5sp: {
        id: 'm5sp',
        ext: 'm5sp',
        proprietary: true,
        available: true,
        family: 'photon-workshop'
    },
    pm7: {
        id: 'pm7',
        ext: 'pm7',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    },
    pm7m: {
        id: 'pm7m',
        ext: 'pm7m',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    },
    pwsz: {
        id: 'pwsz',
        ext: 'pwsz',
        proprietary: true,
        available: false,
        family: 'photon-workshop'
    }
};

export function getSLAFormat(device) {
    return device.slaFormat || DEVICE_FORMAT[device.deviceName] || 'cxdlp';
}

export function getSLAFormatRecord(device) {
    let id = getSLAFormat(device);
    return SLA_FORMATS[id] || SLA_FORMATS.cxdlp;
}

export function getSLAFileExt(device) {
    let rec = getSLAFormatRecord(device);
    return device.slaFileExt || rec.ext || rec.id;
}

export function canEditSLAMachine(device) {
    return device.slaMachineEditable === true ||
        getSLAFormatRecord(device).editableMachine === true;
}
