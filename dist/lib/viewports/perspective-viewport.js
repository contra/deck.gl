import Viewport from './viewport';
import {mat4} from 'gl-matrix';

var DEGREES_TO_RADIANS = Math.PI / 180;

var PerspectiveViewport = (function (Viewport) {
  function PerspectiveViewport(ref) {
    var width = ref.width;
    var height = ref.height;
    var eye = ref.eye;
    var lookAt = ref.lookAt; if ( lookAt === void 0 ) lookAt = [0, 0, 0];
    var up = ref.up; if ( up === void 0 ) up = [0, 1, 0];
    var fovy = ref.fovy; if ( fovy === void 0 ) fovy = 75;
    var near = ref.near; if ( near === void 0 ) near = 1;
    var far = ref.far; if ( far === void 0 ) far = 100;
    var aspect = ref.aspect; if ( aspect === void 0 ) aspect = null;

    var fovyRadians = fovy * DEGREES_TO_RADIANS;
    aspect = Number.isFinite(aspect) ? aspect : width / height;
    Viewport.call(this, {
      viewMatrix: mat4.lookAt([], eye, lookAt, up),
      projectionMatrix: mat4.perspective([], fovyRadians, aspect, near, far),
      width: width,
      height: height
    });
  }

  if ( Viewport ) PerspectiveViewport.__proto__ = Viewport;
  PerspectiveViewport.prototype = Object.create( Viewport && Viewport.prototype );
  PerspectiveViewport.prototype.constructor = PerspectiveViewport;

  return PerspectiveViewport;
}(Viewport));

export default PerspectiveViewport;
