/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

const CURVE_TYPE = {
    ARC: 'arc',
    CIRCLE: 'circle'
};

const CURVE_DEF = {
    ARC_THREE_POINT: 'three-point',
    ARC_CENTER_POINT: 'center-point',
    ARC_TANGENT: 'tangent',
    CIRCLE_CENTER_POINT: 'center-point',
    CIRCLE_THREE_POINT: 'three-point'
};

function isArcEntity(entity) {
    return entity?.type === 'arc' || entity?.curveType === CURVE_TYPE.ARC || entity?.curveType === CURVE_TYPE.CIRCLE || entity?.circle === true;
}

function getCurveType(entity) {
    if (!entity || typeof entity !== 'object') return null;
    if (entity?.curveType === CURVE_TYPE.CIRCLE) return CURVE_TYPE.CIRCLE;
    if (entity?.curveType === CURVE_TYPE.ARC) return CURVE_TYPE.ARC;
    if (entity?.circle === true) return CURVE_TYPE.CIRCLE;
    if (entity?.type === 'arc') return CURVE_TYPE.ARC;
    return null;
}

function isCircleCurve(entity) {
    return getCurveType(entity) === CURVE_TYPE.CIRCLE;
}

function getCurveDefinition(entity) {
    if (!isArcEntity(entity)) return null;
    if (typeof entity?.curveDefinition === 'string' && entity.curveDefinition) {
        return entity.curveDefinition;
    }
    if (isCircleCurve(entity)) {
        return CURVE_DEF.CIRCLE_CENTER_POINT;
    }
    if (Number.isFinite(entity?.mx) && Number.isFinite(entity?.my)) {
        return CURVE_DEF.ARC_THREE_POINT;
    }
    return CURVE_DEF.ARC_CENTER_POINT;
}

function applyCurveSchema(entity, curveType, curveDefinition) {
    if (!isArcEntity(entity)) return false;
    let changed = false;
    if (entity.curveType !== curveType) {
        entity.curveType = curveType;
        changed = true;
    }
    if (entity.curveDefinition !== curveDefinition) {
        entity.curveDefinition = curveDefinition;
        changed = true;
    }
    const legacyCircle = curveType === CURVE_TYPE.CIRCLE;
    if (entity.circle !== legacyCircle) {
        entity.circle = legacyCircle;
        changed = true;
    }
    return changed;
}

function markArcThreePoint(entity) {
    return applyCurveSchema(entity, CURVE_TYPE.ARC, CURVE_DEF.ARC_THREE_POINT);
}

function markArcCenterPoint(entity) {
    return applyCurveSchema(entity, CURVE_TYPE.ARC, CURVE_DEF.ARC_CENTER_POINT);
}

function markArcTangent(entity) {
    return applyCurveSchema(entity, CURVE_TYPE.ARC, CURVE_DEF.ARC_TANGENT);
}

function markCircleCenterPoint(entity) {
    return applyCurveSchema(entity, CURVE_TYPE.CIRCLE, CURVE_DEF.CIRCLE_CENTER_POINT);
}

function markCircleThreePoint(entity) {
    return applyCurveSchema(entity, CURVE_TYPE.CIRCLE, CURVE_DEF.CIRCLE_THREE_POINT);
}

function isCenterPointCircle(entity) {
    return isCircleCurve(entity) && getCurveDefinition(entity) === CURVE_DEF.CIRCLE_CENTER_POINT;
}

function isThreePointCircle(entity) {
    if (!isCircleCurve(entity)) return false;
    if (getCurveDefinition(entity) !== CURVE_DEF.CIRCLE_THREE_POINT) return false;
    const ids = Array.isArray(entity?.data?.threePointIds) ? entity.data.threePointIds.filter(Boolean) : [];
    return ids.length >= 3;
}

export {
    CURVE_TYPE,
    CURVE_DEF,
    isArcEntity,
    getCurveType,
    isCircleCurve,
    getCurveDefinition,
    applyCurveSchema,
    markArcThreePoint,
    markArcCenterPoint,
    markArcTangent,
    markCircleCenterPoint,
    markCircleThreePoint,
    isCenterPointCircle,
    isThreePointCircle
};
