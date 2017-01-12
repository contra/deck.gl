// eslint-disable
// View and Projection Matrix management

// gl-matrix is a large dependency for a small module.
// However since it is used by mapbox etc, it should already be present
// in most target application bundles.
import {mat4, vec4} from 'gl-matrix';

var IDENTITY = createMat4();

var Viewport = function Viewport(ref) {
  if ( ref === void 0 ) ref = {};
  var width = ref.width; if ( width === void 0 ) width = 1;
  var height = ref.height; if ( height === void 0 ) height = 1;
  var viewMatrix = ref.viewMatrix; if ( viewMatrix === void 0 ) viewMatrix = IDENTITY;
  var projectionMatrix = ref.projectionMatrix; if ( projectionMatrix === void 0 ) projectionMatrix = IDENTITY;

  // Silently allow apps to send in 0,0
  this.width = width || 1;
  this.height = height || 1;
  this.scale = 1;

  this.viewMatrix = viewMatrix;
  this.projectionMatrix = projectionMatrix;

  // Note: As usual, matrix operations should be applied in "reverse" order
  // since vectors will be multiplied in from the right during transformation
  var vpm = createMat4();
  mat4.multiply(vpm, vpm, this.projectionMatrix);
  mat4.multiply(vpm, vpm, this.viewMatrix);
  this.viewProjectionMatrix = vpm;

  // Calculate matrices and scales needed for projection
  /**
   * Builds matrices that converts preprojected lngLats to screen pixels
   * and vice versa.
   * Note: Currently returns bottom-left coordinates!
   * Note: Starts with the GL projection matrix and adds steps to the
   *     scale and translate that matrix onto the window.
   * Note: WebGL controls clip space to screen projection with gl.viewport
   *     and does not need this step.
   */
  var m = createMat4();

  // Scale with viewport window's width and height in pixels
  mat4.scale(m, m, [this.width, this.height, 1]);
  // Convert to (0, 1)
  mat4.translate(m, m, [0.5, 0.5, 0]);
  mat4.scale(m, m, [0.5, 0.5, 1]);
  // Project to clip space (-1, 1)
  mat4.multiply(m, m, this.viewProjectionMatrix);

  var mInverse = mat4.invert(createMat4(), m);
  if (!mInverse) {
    throw new Error('Pixel project matrix not invertible');
  }

  this.pixelProjectionMatrix = m;
  this.pixelUnprojectionMatrix = mInverse;

  this.project = this.project.bind(this);
  this.unproject = this.unproject.bind(this);
  this.projectFlat = this.projectFlat.bind(this);
  this.unprojectFlat = this.unprojectFlat.bind(this);
  this.getMatrices = this.getMatrices.bind(this);
};
/* eslint-enable complexity */

// Two viewports are equal if width and height are identical, and if
// their view and projection matrices are (approximately) equal.
Viewport.prototype.equals = function equals (viewport) {
  if (!(viewport instanceof Viewport)) {
    return false;
  }

  return viewport.width === this.width &&
    viewport.height === this.height &&
    mat4.equals(viewport.projectionMatrix, this.projectionMatrix) &&
    mat4.equals(viewport.viewMatrix, this.viewMatrix);
};

/**
 * Projects xyz (possibly latitude and longitude) to pixel coordinates in window
 * using viewport projection parameters
 * - [longitude, latitude] to [x, y]
 * - [longitude, latitude, Z] => [x, y, z]
 * Note: By default, returns top-left coordinates for canvas/SVG type render
 *
 * @param {Array} lngLatZ - [lng, lat] or [lng, lat, Z]
 * @param {Object} opts - options
 * @param {Object} opts.topLeft=true - Whether projected coords are top left
 * @return {Array} - [x, y] or [x, y, z] in top left coords
 */
Viewport.prototype.project = function project (xyz, ref) {
    if ( ref === void 0 ) ref = {};
    var topLeft = ref.topLeft; if ( topLeft === void 0 ) topLeft = false;

  var Z = xyz[2] || 0;
  // console.error('projecting non-linear', xyz);
  var ref$1 = this.projectFlat(xyz);
    var X = ref$1[0];
    var Y = ref$1[1];
  var v = [X, Y, Z, 1];
  // console.error('projecting linear', v);
  // vec4.sub(v, v, [this.centerX, this.centerY, 0, 0]);
  vec4.transformMat4(v, v, this.pixelProjectionMatrix);
  // Divide by w
  var scale = 1 / v[3];
  vec4.multiply(v, v, [scale, scale, scale, scale]);
  // console.error('projected', v);
  var x = v[0];
    var z = v[2];
  var y = topLeft ? this.height - v[1] : v[1];
  return xyz.length === 2 ? [x, y] : [x, y, z];
};

/**
 * Unproject pixel coordinates on screen onto world coordinates,
 * (possibly [lon, lat]) on map.
 * - [x, y] => [lng, lat]
 * - [x, y, z] => [lng, lat, Z]
 * @param {Array} xyz -
 * @return {Array} - [lng, lat, Z] or [X, Y, Z]
 */
Viewport.prototype.unproject = function unproject (xyz, ref) {
    if ( ref === void 0 ) ref = {};
    var topLeft = ref.topLeft; if ( topLeft === void 0 ) topLeft = false;

  // console.error('unprojecting linear', xyz);
  var x = xyz[0]; if ( x === void 0 ) x = 0;
    var y = xyz[1]; if ( y === void 0 ) y = 0;
    var z = xyz[2]; if ( z === void 0 ) z = 0;
  // const y2 = topLeft ? this.height - 1 - y : y;
  var y2 = topLeft ? this.height - y : y;
  var v = [x, y2, z, 1];
  vec4.transformMat4(v, v, this.pixelUnprojectionMatrix);
  var scale = 1 / v[3];
  vec4.multiply(v, v, [scale, scale, scale, scale]);
  // console.error('unprojecting non-linear', v);
  var ref$1 = this.unprojectFlat(v);
    var x0 = ref$1[0];
    var y0 = ref$1[1];
  // console.error('unprojected', [x0, y0]);
  var z0 = v[2];
  return xyz.length === 2 ? [x0, y0] : [x0, y0, z0];
};

// NON_LINEAR PROJECTION HOOKS
// Used for web meractor projection

/**
 * Project [lng,lat] on sphere onto [x,y] on 512*512 Mercator Zoom 0 tile.
 * Performs the nonlinear part of the web mercator projection.
 * Remaining projection is done with 4x4 matrices which also handles
 * perspective.
 * @param {Array} lngLat - [lng, lat] coordinates
 * Specifies a point on the sphere to project onto the map.
 * @return {Array} [x,y] coordinates.
 */
Viewport.prototype.projectFlat = function projectFlat (ref, scale) {
    var x = ref[0];
    var y = ref[1];
    if ( scale === void 0 ) scale = this.scale;

  return (ref$1 = this)._projectFlat.apply(ref$1, arguments);
    var ref$1;
};

/**
 * Unproject world point [x,y] on map onto {lat, lon} on sphere
 * @param {object|Vector} xy - object with {x,y} members
 *representing point on projected map plane
 * @return {GeoCoordinates} - object with {lat,lon} of point on sphere.
 * Has toArray method if you need a GeoJSON Array.
 * Per cartographic tradition, lat and lon are specified as degrees.
 */
Viewport.prototype.unprojectFlat = function unprojectFlat (xyz, scale) {
    if ( scale === void 0 ) scale = this.scale;

  return (ref = this)._unprojectFlat.apply(ref, arguments);
    var ref;
};

// _projectFlat(xyz, scale = this.scale) {
// return xyz;
// }

// _unprojectFlat(xyz, scale = this.scale) {
// return xyz;
// }

Viewport.prototype.getMatrices = function getMatrices (ref) {
    if ( ref === void 0 ) ref = {};
    var modelMatrix = ref.modelMatrix; if ( modelMatrix === void 0 ) modelMatrix = null;

  var modelViewProjectionMatrix = this.viewProjectionMatrix;
  var pixelProjectionMatrix = this.pixelProjectionMatrix;
  var pixelUnprojectionMatrix = this.pixelUnprojectionMatrix;

  if (modelMatrix) {
    modelViewProjectionMatrix = mat4.multiply([], this.viewProjectionMatrix, modelMatrix);
    pixelProjectionMatrix = mat4.multiply([], this.pixelProjectionMatrix, modelMatrix);
    pixelUnprojectionMatrix = mat4.invert([], pixelProjectionMatrix);
  }

  var matrices = Object.assign({
    modelViewProjectionMatrix: modelViewProjectionMatrix,
    viewProjectionMatrix: this.viewProjectionMatrix,
    viewMatrix: this.viewMatrix,
    projectionMatrix: this.projectionMatrix,

    // project/unproject between pixels and world
    pixelProjectionMatrix: pixelProjectionMatrix,
    pixelUnprojectionMatrix: pixelUnprojectionMatrix,

    width: this.width,
    height: this.height,
    scale: this.scale
  },

    // Subclass can add additional params
    // TODO - Fragile: better to make base Viewport class aware of all params
    this._getParams()
  );

  return matrices;
};

// INTERNAL METHODS

// Can be subclassed to add additional fields to `getMatrices`
Viewport.prototype._getParams = function _getParams () {
  return {};
};

export default Viewport;

// Helper, avoids low-precision 32 bit matrices from gl-matrix mat4.create()
export function createMat4() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
