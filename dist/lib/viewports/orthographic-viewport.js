import Viewport from './viewport';
import {mat4} from 'gl-matrix';

var OrthographicViewport = (function (Viewport) {
  function OrthographicViewport(ref) {
    var width = ref.width;
    var height = ref.height;
    var eye = ref.eye;
    var lookAt = ref.lookAt; if ( lookAt === void 0 ) lookAt = [0, 0, 0];
    var up = ref.up; if ( up === void 0 ) up = [0, 1, 0];
    var near = ref.near; if ( near === void 0 ) near = 1;
    var far = ref.far; if ( far === void 0 ) far = 100;
    var fovy = ref.fovy; if ( fovy === void 0 ) fovy = 75;
    var left = ref.left;
    var top = ref.top;
    var right = ref.right; if ( right === void 0 ) right = null;
    var bottom = ref.bottom; if ( bottom === void 0 ) bottom = null;

    right = Number.isFinite(right) ? right : left + width;
    bottom = Number.isFinite(bottom) ? right : top + height;
    Viewport.call(this, {
      viewMatrix: mat4.lookAt([], eye, lookAt, up),
      projectionMatrix: mat4.ortho([], left, right, bottom, top, near, far),
      width: width,
      height: height
    });
  }

  if ( Viewport ) OrthographicViewport.__proto__ = Viewport;
  OrthographicViewport.prototype = Object.create( Viewport && Viewport.prototype );
  OrthographicViewport.prototype.constructor = OrthographicViewport;

  return OrthographicViewport;
}(Viewport));

export default OrthographicViewport;
