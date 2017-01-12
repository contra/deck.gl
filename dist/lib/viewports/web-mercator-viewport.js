// View and Projection Matrix calculations for mapbox-js style
// map view properties
import Viewport, {createMat4} from './viewport';
import {mat4, vec4, vec2} from 'gl-matrix';

// CONSTANTS
var PI = Math.PI;
var PI_4 = PI / 4;
var DEGREES_TO_RADIANS = PI / 180;
var RADIANS_TO_DEGREES = 180 / PI;
var TILE_SIZE = 512;
var WORLD_SCALE = TILE_SIZE / (2 * PI);

var DEFAULT_MAP_STATE = {
  latitude: 37,
  longitude: -122,
  zoom: 11,
  pitch: 0,
  bearing: 0,
  altitude: 1.5
};

var WebMercatorViewport = (function (Viewport) {
  function WebMercatorViewport(ref) {
    if ( ref === void 0 ) ref = {};
    var width = ref.width;
    var height = ref.height;
    var latitude = ref.latitude;
    var longitude = ref.longitude;
    var zoom = ref.zoom;
    var pitch = ref.pitch;
    var bearing = ref.bearing;
    var altitude = ref.altitude;
    var mercatorEnabled = ref.mercatorEnabled;

    // Viewport - support undefined arguments
    width = width !== undefined ? width : DEFAULT_MAP_STATE.width;
    height = height !== undefined ? height : DEFAULT_MAP_STATE.height;
    zoom = zoom !== undefined ? zoom : DEFAULT_MAP_STATE.zoom;
    latitude = latitude !== undefined ? latitude : DEFAULT_MAP_STATE.latitude;
    longitude = longitude !== undefined ? longitude : DEFAULT_MAP_STATE.longitude;
    bearing = bearing !== undefined ? bearing : DEFAULT_MAP_STATE.bearing;
    pitch = pitch !== undefined ? pitch : DEFAULT_MAP_STATE.pitch;
    altitude = altitude !== undefined ? altitude : DEFAULT_MAP_STATE.altitude;

    // Silently allow apps to send in 0,0 to facilitate isomorphic render etc
    width = width || 1;
    height = height || 1;

    var scale = Math.pow(2, zoom);
    // Altitude - prevent division by 0
    // TODO - just throw an Error instead?
    altitude = Math.max(0.75, altitude);

    var distanceScales = calculateDistanceScales({latitude: latitude, longitude: longitude, scale: scale});

    var projectionMatrix = makeProjectionMatrixFromMercatorParams({
      width: width,
      height: height,
      pitch: pitch,
      bearing: bearing,
      altitude: altitude
    });

    var ref$1 =
      makeViewMatrixFromMercatorParams({
        width: width,
        height: height,
        longitude: longitude,
        latitude: latitude,
        zoom: zoom,
        pitch: pitch,
        bearing: bearing,
        altitude: altitude,
        distanceScales: distanceScales
      });
    var viewMatrix = ref$1.viewMatrix;
    var viewMatrixUncentered = ref$1.viewMatrixUncentered;
    var viewCenter = ref$1.viewCenter;

    Viewport.call(this, {width: width, height: height, viewMatrix: viewMatrix, projectionMatrix: projectionMatrix});

    // Add additional matrices
    this.viewMatrixUncentered = viewMatrixUncentered;
    this.viewCenter = viewCenter;

    // Save parameters
    this.latitude = latitude;
    this.longitude = longitude;
    this.zoom = zoom;
    this.pitch = pitch;
    this.bearing = bearing;
    this.altitude = altitude;

    this.scale = scale;

    this._distanceScales = distanceScales;

    this.getDistanceScales = this.getDistanceScales.bind(this);
    this.metersToLngLatDelta = this.metersToLngLatDelta.bind(this);
    this.lngLatDeltaToMeters = this.lngLatDeltaToMeters.bind(this);
    this.addMetersToLngLat = this.addMetersToLngLat.bind(this);
  }

  if ( Viewport ) WebMercatorViewport.__proto__ = Viewport;
  WebMercatorViewport.prototype = Object.create( Viewport && Viewport.prototype );
  WebMercatorViewport.prototype.constructor = WebMercatorViewport;
  /* eslint-enable complexity, max-statements */

  /**
   * Project [lng,lat] on sphere onto [x,y] on 512*512 Mercator Zoom 0 tile.
   * Performs the nonlinear part of the web mercator projection.
   * Remaining projection is done with 4x4 matrices which also handles
   * perspective.
   *
   * @param {Array} lngLat - [lng, lat] coordinates
   *   Specifies a point on the sphere to project onto the map.
   * @return {Array} [x,y] coordinates.
   */
  WebMercatorViewport.prototype._projectFlat = function _projectFlat (lngLat, scale) {
    if ( scale === void 0 ) scale = this.scale;

    return projectFlat(lngLat, scale);
  };

  /**
   * Unproject world point [x,y] on map onto {lat, lon} on sphere
   *
   * @param {object|Vector} xy - object with {x,y} members
   *  representing point on projected map plane
   * @return {GeoCoordinates} - object with {lat,lon} of point on sphere.
   *   Has toArray method if you need a GeoJSON Array.
   *   Per cartographic tradition, lat and lon are specified as degrees.
   */
  WebMercatorViewport.prototype._unprojectFlat = function _unprojectFlat (xy, scale) {
    if ( scale === void 0 ) scale = this.scale;

    return unprojectFlat(xy, scale);
  };

  WebMercatorViewport.prototype.getDistanceScales = function getDistanceScales () {
    return this._distanceScales;
  };

  /**
   * Converts a meter offset to a lnglat offset
   *
   * Note: Uses simple linear approximation around the viewport center
   * Error increases with size of offset (roughly 1% per 100km)
   *
   * @param {[Number,Number]|[Number,Number,Number]) xyz - array of meter deltas
   * @return {[Number,Number]|[Number,Number,Number]) - array of [lng,lat,z] deltas
   */
  WebMercatorViewport.prototype.metersToLngLatDelta = function metersToLngLatDelta (xyz) {
    var x = xyz[0];
    var y = xyz[1];
    var z = xyz[2]; if ( z === void 0 ) z = 0;
    var ref = this._distanceScales;
    var pixelsPerMeter = ref.pixelsPerMeter;
    var degreesPerPixel = ref.degreesPerPixel;
    var deltaLng = x * pixelsPerMeter[0] * degreesPerPixel[0];
    var deltaLat = y * pixelsPerMeter[1] * degreesPerPixel[1];
    return xyz.length === 2 ? [deltaLng, deltaLat] : [deltaLng, deltaLat, z];
  };

  /**
   * Converts a lnglat offset to a meter offset
   *
   * Note: Uses simple linear approximation around the viewport center
   * Error increases with size of offset (roughly 1% per 100km)
   *
   * @param {[Number,Number]|[Number,Number,Number]) deltaLngLatZ - array of [lng,lat,z] deltas
   * @return {[Number,Number]|[Number,Number,Number]) - array of meter deltas
   */
  WebMercatorViewport.prototype.lngLatDeltaToMeters = function lngLatDeltaToMeters (deltaLngLatZ) {
    var deltaLng = deltaLngLatZ[0];
    var deltaLat = deltaLngLatZ[1];
    var deltaZ = deltaLngLatZ[2]; if ( deltaZ === void 0 ) deltaZ = 0;
    var ref = this._distanceScales;
    var pixelsPerDegree = ref.pixelsPerDegree;
    var metersPerPixel = ref.metersPerPixel;
    var deltaX = deltaLng * pixelsPerDegree[0] * metersPerPixel[0];
    var deltaY = deltaLat * pixelsPerDegree[1] * metersPerPixel[1];
    return deltaLngLatZ.length === 2 ? [deltaX, deltaY] : [deltaX, deltaY, deltaZ];
  };

  /**
   * Add a meter delta to a base lnglat coordinate, returning a new lnglat array
   *
   * Note: Uses simple linear approximation around the viewport center
   * Error increases with size of offset (roughly 1% per 100km)
   *
   * @param {[Number,Number]|[Number,Number,Number]) lngLatZ - base coordinate
   * @param {[Number,Number]|[Number,Number,Number]) xyz - array of meter deltas
   * @return {[Number,Number]|[Number,Number,Number]) array of [lng,lat,z] deltas
   */
  WebMercatorViewport.prototype.addMetersToLngLat = function addMetersToLngLat (lngLatZ, xyz) {
    var lng = lngLatZ[0];
    var lat = lngLatZ[1];
    var Z = lngLatZ[2]; if ( Z === void 0 ) Z = 0;
    var ref = this.metersToLngLatDelta(xyz);
    var deltaLng = ref[0];
    var deltaLat = ref[1];
    var deltaZ = ref[2]; if ( deltaZ === void 0 ) deltaZ = 0;
    return lngLatZ.length === 2 ?
      [lng + deltaLng, lat + deltaLat] :
      [lng + deltaLng, lat + deltaLat, Z + deltaZ];
  };

  // INTERNAL METHODS

  WebMercatorViewport.prototype._getParams = function _getParams () {
    return this._distanceScales;
  };

  return WebMercatorViewport;
}(Viewport));

export default WebMercatorViewport;

/**
 * Project [lng,lat] on sphere onto [x,y] on 512*512 Mercator Zoom 0 tile.
 * Performs the nonlinear part of the web mercator projection.
 * Remaining projection is done with 4x4 matrices which also handles
 * perspective.
 *
 * @param {Array} lngLat - [lng, lat] coordinates
 *   Specifies a point on the sphere to project onto the map.
 * @return {Array} [x,y] coordinates.
 */
function projectFlat(ref, scale) {
  var lng = ref[0];
  var lat = ref[1];

  scale = scale * WORLD_SCALE;
  var lambda2 = lng * DEGREES_TO_RADIANS;
  var phi2 = lat * DEGREES_TO_RADIANS;
  var x = scale * (lambda2 + PI);
  var y = scale * (PI - Math.log(Math.tan(PI_4 + phi2 * 0.5)));
  return [x, y];
}

/**
 * Unproject world point [x,y] on map onto {lat, lon} on sphere
 *
 * @param {object|Vector} xy - object with {x,y} members
 *  representing point on projected map plane
 * @return {GeoCoordinates} - object with {lat,lon} of point on sphere.
 *   Has toArray method if you need a GeoJSON Array.
 *   Per cartographic tradition, lat and lon are specified as degrees.
 */
function unprojectFlat(ref, scale) {
  var x = ref[0];
  var y = ref[1];

  scale = scale * WORLD_SCALE;
  var lambda2 = x / scale - PI;
  var phi2 = 2 * (Math.atan(Math.exp(PI - y / scale)) - PI_4);
  return [lambda2 * RADIANS_TO_DEGREES, phi2 * RADIANS_TO_DEGREES];
}

/**
 * Calculate distance scales in meters around current lat/lon, both for
 * degrees and pixels.
 * In mercator projection mode, the distance scales vary significantly
 * with latitude.
 */
function calculateDistanceScales(ref) {
  var latitude = ref.latitude;
  var longitude = ref.longitude;
  var scale = ref.scale;

  // Approximately 111km per degree at equator
  var METERS_PER_DEGREE = 111000;

  var latCosine = Math.cos(latitude * Math.PI / 180);

  var metersPerDegree = METERS_PER_DEGREE * latCosine;

  // Calculate number of pixels occupied by one degree longitude
  // around current lat/lon
  var pixelsPerDegreeX = vec2.distance(
    projectFlat([longitude + 0.5, latitude]),
    projectFlat([longitude - 0.5, latitude])
  );
  // Calculate number of pixels occupied by one degree latitude
  // around current lat/lon
  var pixelsPerDegreeY = vec2.distance(
    projectFlat([longitude, latitude + 0.5]),
    projectFlat([longitude, latitude - 0.5])
  );

  var pixelsPerMeterX = pixelsPerDegreeX / metersPerDegree;
  var pixelsPerMeterY = pixelsPerDegreeY / metersPerDegree;
  var pixelsPerMeterZ = (pixelsPerMeterX + pixelsPerMeterY) / 2;
  // const pixelsPerMeter = [pixelsPerMeterX, pixelsPerMeterY, pixelsPerMeterZ];

  var worldSize = TILE_SIZE * scale;
  var altPixelsPerMeter = worldSize / (4e7 * latCosine);
  var pixelsPerMeter = [altPixelsPerMeter, altPixelsPerMeter, altPixelsPerMeter];
  var metersPerPixel = [1 / altPixelsPerMeter, 1 / altPixelsPerMeter, 1 / pixelsPerMeterZ];

  var pixelsPerDegree = [pixelsPerDegreeX, pixelsPerDegreeY, pixelsPerMeterZ];
  var degreesPerPixel = [1 / pixelsPerDegreeX, 1 / pixelsPerDegreeY, 1 / pixelsPerMeterZ];

  // Main results, used for converting meters to latlng deltas and scaling offsets
  return {
    pixelsPerMeter: pixelsPerMeter,
    metersPerPixel: metersPerPixel,
    pixelsPerDegree: pixelsPerDegree,
    degreesPerPixel: degreesPerPixel
  };
}

// ATTRIBUTION:
// view and projection matrix creation is intentionally kept compatible with
// mapbox-gl's implementation to ensure that seamless interoperation
// with mapbox and react-map-gl. See: https://github.com/mapbox/mapbox-gl-js
function makeProjectionMatrixFromMercatorParams(ref) {
  var width = ref.width;
  var height = ref.height;
  var pitch = ref.pitch;
  var altitude = ref.altitude;

  var pitchRadians = pitch * DEGREES_TO_RADIANS;

  // PROJECTION MATRIX: PROJECTS FROM CAMERA SPACE TO CLIPSPACE
  // Find the distance from the center point to the center top
  // in altitude units using law of sines.
  var halfFov = Math.atan(0.5 / altitude);
  var topHalfSurfaceDistance =
    Math.sin(halfFov) * altitude / Math.sin(Math.PI / 2 - pitchRadians - halfFov);

  // Calculate z value of the farthest fragment that should be rendered.
  var farZ = Math.cos(Math.PI / 2 - pitchRadians) * topHalfSurfaceDistance + altitude;

  var projectionMatrix = mat4.perspective(
    createMat4(),
    2 * Math.atan((height / 2) / altitude), // fov in radians
    width / height,                         // aspect ratio
    0.1,                                    // near plane
    farZ * 10.0                             // far plane
  );

  return projectionMatrix;
}

function makeViewMatrixFromMercatorParams(ref) {
  var width = ref.width;
  var height = ref.height;
  var longitude = ref.longitude;
  var latitude = ref.latitude;
  var zoom = ref.zoom;
  var pitch = ref.pitch;
  var bearing = ref.bearing;
  var altitude = ref.altitude;

  // Center x, y
  var scale = Math.pow(2, zoom);
  // VIEW MATRIX: PROJECTS FROM VIRTUAL PIXELS TO CAMERA SPACE
  // Note: As usual, matrix operation orders should be read in reverse
  // since vectors will be multiplied from the right during transformation
  var vm = createMat4();

  // Move camera to altitude
  mat4.translate(vm, vm, [0, 0, -altitude]);

  // After the rotateX, z values are in pixel units. Convert them to
  // altitude units. 1 altitude unit = the screen height.
  mat4.scale(vm, vm, [1, -1, 1 / height]);

  // Rotate by bearing, and then by pitch (which tilts the view)
  mat4.rotateX(vm, vm, pitch * DEGREES_TO_RADIANS);
  mat4.rotateZ(vm, vm, -bearing * DEGREES_TO_RADIANS);

  var ref$1 = projectFlat([longitude, latitude], scale);
  var centerX = ref$1[0];
  var centerY = ref$1[1];

  var center = [-centerX, -centerY, 0, 1];
  var viewCenter = vec4.transformMat4([], center, vm);

  var vmCentered = mat4.translate([], vm, [-centerX, -centerY, 0]);

  return {
    viewMatrix: vmCentered,
    viewMatrixUncentered: vm,
    viewCenter: viewCenter
  };
}
