/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const DEFAULT_PWM = 255;
const TILT_MOTION = {
    liftHeight: 0.05,
    liftSpeed: 0.05,
    retractHeight: 0,
    retractSpeed: 0.05,
    motorTime: 4
};

export function createProcessMetadata(device, process) {
    let transitionLayers = intValue(process.slaTransitionLayers);
    let lightPWM = pwmValue(process.slaLightPWM);
    let bottomLightPWM = pwmValue(process.slaBaseLightPWM, lightPWM);
    let normalMotion = motionFor(device, process, false);
    let bottomMotion = motionFor(device, process, true);

    return {
        bottomLayers: intValue(process.slaBaseLayers),
        transitionLayers,
        exposure: number(process.slaLayerOn),
        bottomExposure: number(process.slaBaseOn),
        lightOffDelay: number(process.slaLayerOff),
        bottomLightOffDelay: number(process.slaBaseOff),
        waitBeforeCure: number(process.slaWaitBeforeCure ?? process.slaLayerOff),
        bottomWaitBeforeCure: number(process.slaBaseWaitBeforeCure ?? process.slaBaseOff),
        waitAfterCure: number(process.slaWaitAfterCure),
        bottomWaitAfterCure: number(process.slaBaseWaitAfterCure),
        waitAfterLift: number(process.slaWaitAfterLift),
        bottomWaitAfterLift: number(process.slaBaseWaitAfterLift),
        liftHeight: normalMotion.liftHeight,
        bottomLiftHeight: bottomMotion.liftHeight,
        liftSpeed: normalMotion.liftSpeed,
        bottomLiftSpeed: bottomMotion.liftSpeed,
        retractHeight: normalMotion.retractHeight,
        bottomRetractHeight: bottomMotion.retractHeight,
        retractSpeed: normalMotion.retractSpeed,
        bottomRetractSpeed: bottomMotion.retractSpeed,
        lightPWM,
        bottomLightPWM,
        motion: device.slaMotion || "normal",
        firstLayerOffset: number(process.slaFirstOffset),
        antiAlias: intValue(process.slaAntiAlias, 1)
    };
}

export function createLayerMetadata(device, process, index, z, area) {
    let meta = createProcessMetadata(device, process);
    let bottom = index < meta.bottomLayers;
    let transitionIndex = bottom ? -1 : index - meta.bottomLayers;
    let transition = transitionIndex >= 0 && transitionIndex < meta.transitionLayers;
    let motion = motionFor(device, process, bottom);

    return {
        index,
        z: round(z),
        area: round(area),
        bottom,
        transition,
        transitionIndex: transition ? transitionIndex : -1,
        exposure: round(layerExposure(meta, bottom, transitionIndex)),
        lightOffDelay: bottom ? meta.bottomLightOffDelay : meta.lightOffDelay,
        waitBeforeCure: bottom ? meta.bottomWaitBeforeCure : meta.waitBeforeCure,
        waitAfterCure: bottom ? meta.bottomWaitAfterCure : meta.waitAfterCure,
        waitAfterLift: bottom ? meta.bottomWaitAfterLift : meta.waitAfterLift,
        liftHeight: motion.liftHeight,
        liftSpeed: motion.liftSpeed,
        retractHeight: motion.retractHeight,
        retractSpeed: motion.retractSpeed,
        lightPWM: bottom ? meta.bottomLightPWM : meta.lightPWM
    };
}

export function motionFor(device, process, bottom) {
    if (device.slaMotion === "tilt") {
        return TILT_MOTION;
    }

    let normalDrop = process.slaPeelDropRate;
    let bottomDrop = process.slaBasePeelDropRate ?? normalDrop;
    return {
        liftHeight: number(bottom ? process.slaBasePeelDist : process.slaPeelDist),
        liftSpeed: number(bottom ? process.slaBasePeelLiftRate : process.slaPeelLiftRate) * 60,
        retractHeight: number(bottom ? process.slaBasePeelDist : process.slaPeelDist),
        retractSpeed: number(bottom ? bottomDrop : normalDrop) * 60,
        motorTime: 0
    };
}

export function estimatePrintTime(device, process, layers) {
    let meta = createProcessMetadata(device, process);
    let seconds = 0;
    for (let index=0; index<layers; index++) {
        let layer = createLayerMetadata(device, process, index, 0, 0);
        let motor = device.slaMotion === "tilt" ? TILT_MOTION.motorTime : 0;
        seconds += layer.exposure + layer.waitBeforeCure + layer.waitAfterCure + layer.waitAfterLift + motor;
    }
    return Math.ceil(seconds);
}

export function round(value) {
    return Number.parseFloat(Number(value || 0).toFixed(5));
}

function layerExposure(meta, bottom, transitionIndex) {
    if (bottom || meta.transitionLayers <= 0 || transitionIndex < 0 || transitionIndex >= meta.transitionLayers) {
        return bottom ? meta.bottomExposure : meta.exposure;
    }

    let step = (transitionIndex + 1) / (meta.transitionLayers + 1);
    return meta.bottomExposure + (meta.exposure - meta.bottomExposure) * step;
}

function pwmValue(value, fallback = DEFAULT_PWM) {
    value = intValue(value, fallback);
    return Math.max(0, Math.min(255, value));
}

function intValue(value, fallback = 0) {
    value = Number.parseInt(value);
    return Number.isFinite(value) ? value : fallback;
}

function number(value) {
    value = Number(value);
    return Number.isFinite(value) ? value : 0;
}
