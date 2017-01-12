import {Matrix4} from 'luma.gl';

import assert from 'assert';
import {COORDINATE_SYSTEM} from './constants';

function fp64ify(a) {
  var hiPart = Math.fround(a);
  var loPart = a - Math.fround(a);
  return [hiPart, loPart];
}

// To quickly set a vector to zero
var ZERO_VECTOR = [0, 0, 0, 0];
// 4x4 matrix that drops 4th component of vector
var VECTOR_TO_POINT_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];

function calculateMatrixAndOffset(ref) {
  var projectionMode = ref.projectionMode;
  var positionOrigin = ref.positionOrigin;
  var viewport = ref.viewport;
  var modelMatrix = ref.modelMatrix;

  var viewMatrixUncentered = viewport.viewMatrixUncentered;
  var viewMatrix = viewport.viewMatrix;
  var projectionMatrix = viewport.projectionMatrix;

  var projectionCenter;
  var modelViewProjectionMatrix;

  var viewProjectionMatrix = new Matrix4(projectionMatrix).multiplyRight(viewMatrix);

  switch (projectionMode) {

  case COORDINATE_SYSTEM.LNGLAT:
    projectionCenter = ZERO_VECTOR;
    modelViewProjectionMatrix = viewProjectionMatrix;
    if (modelMatrix) {
      // Apply model matrix if supplied
      // modelViewProjectionMatrix = modelViewProjectionMatrix.clone();
      modelViewProjectionMatrix.multiplyRight(modelMatrix);
    }
    break;

  case COORDINATE_SYSTEM.METER_OFFSETS:
    // Calculate transformed projectionCenter (in 64 bit precision)
    // This is the key to offset mode precision (avoids doing this
    // addition in 32 bit precision)
    var positionPixels = viewport.projectFlat(positionOrigin);
    projectionCenter = viewProjectionMatrix
      .transformVector([positionPixels[0], positionPixels[1], 0.0, 1.0]);

    modelViewProjectionMatrix = new Matrix4(projectionMatrix)
      // Always apply uncentered projection matrix (shader adds center)
      .multiplyRight(viewMatrixUncentered)
      // Zero out 4th coordinate ("after" model matrix) - avoids further translations
      .multiplyRight(VECTOR_TO_POINT_MATRIX);

    if (modelMatrix) {
      // Apply model matrix if supplied
      modelViewProjectionMatrix.multiplyRight(modelMatrix);
    }
    break;

  default:
    throw new Error('Unknown projection mode');
  }

  return {
    modelViewProjectionMatrix: modelViewProjectionMatrix,
    projectionCenter: projectionCenter
  };
}

/**
 * Returns uniforms for shaders based on current projection
 * includes: projection matrix suitable for shaders
 *
 * TODO - Ensure this works with any viewport, not just WebMercatorViewports
 *
 * @param {WebMercatorViewport} viewport -
 * @return {Float32Array} - 4x4 projection matrix that can be used in shaders
 */
export function getUniformsFromViewport(viewport, ref) {
  if ( ref === void 0 ) ref = {};
  var modelMatrix = ref.modelMatrix; if ( modelMatrix === void 0 ) modelMatrix = null;
  var projectionMode = ref.projectionMode; if ( projectionMode === void 0 ) projectionMode = COORDINATE_SYSTEM.LNGLAT;
  var positionOrigin = ref.positionOrigin; if ( positionOrigin === void 0 ) positionOrigin = [0, 0];

  assert(viewport.scale, 'Viewport scale missing');

  var ref$1 =
    calculateMatrixAndOffset({projectionMode: projectionMode, positionOrigin: positionOrigin, modelMatrix: modelMatrix, viewport: viewport});
  var projectionCenter = ref$1.projectionCenter;
  var modelViewProjectionMatrix = ref$1.modelViewProjectionMatrix;

  assert(modelViewProjectionMatrix, 'Viewport missing modelViewProjectionMatrix');

  // Calculate projection pixels per unit
  var projectionPixelsPerUnit = viewport.getDistanceScales().pixelsPerMeter;
  assert(projectionPixelsPerUnit, 'Viewport missing pixelsPerMeter');

  // calculate WebGL matrices

  // Convert to Float32
  var glProjectionMatrix = new Float32Array(modelViewProjectionMatrix);

  // "Float64Array"
  // Transpose the projection matrix to column major for GLSL.
  var glProjectionMatrixFP64 = new Float32Array(32);
  for (var i = 0; i < 4; ++i) {
    for (var j = 0; j < 4; ++j) {
      var assign;
      (assign = fp64ify(modelViewProjectionMatrix[j * 4 + i]), glProjectionMatrixFP64[(i * 4 + j) * 2] = assign[0], glProjectionMatrixFP64[(i * 4 + j) * 2 + 1] = assign[1]);
    }
  }

  return {
    // Projection mode values
    projectionMode: projectionMode,
    projectionCenter: projectionCenter,

    // modelMatrix: modelMatrix || new Matrix4().identity(),

    // Main projection matrices
    projectionMatrix: glProjectionMatrix,
    projectionMatrixUncentered: glProjectionMatrix,
    projectionFP64: glProjectionMatrixFP64,
    projectionPixelsPerUnit: projectionPixelsPerUnit,

    // This is the mercator scale (2 ** zoom)
    projectionScale: viewport.scale,

    // Deprecated?
    projectionScaleFP64: fp64ify(viewport.scale)
  };
}
