// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/* global window */
import React, {PropTypes, createElement} from 'react';
import autobind from './autobind';
import {createGLContext} from 'luma.gl';
/* global requestAnimationFrame, cancelAnimationFrame */

var DEFAULT_PIXEL_RATIO =
  (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

var propTypes = {
  id: PropTypes.string.isRequired,

  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  style: PropTypes.object,

  pixelRatio: PropTypes.number,
  viewport: PropTypes.object.isRequired,
  events: PropTypes.object,
  gl: PropTypes.object,
  glOptions: PropTypes.object,
  debug: PropTypes.bool,

  onInitializationFailed: PropTypes.func,
  onRendererInitialized: PropTypes.func.isRequired,
  onRenderFrame: PropTypes.func,
  onMouseMove: PropTypes.func,
  onClick: PropTypes.func
};

var defaultProps = {
  style: {},
  gl: null,
  glOptions: {preserveDrawingBuffer: true},
  debug: false,
  pixelRatio: DEFAULT_PIXEL_RATIO,

  onInitializationFailed: function (error) {
    throw error;
  },
  onRendererInitialized: function () {},
  onRenderFrame: function () {}
};

var WebGLRenderer = (function (superclass) {
  function WebGLRenderer(props) {
    superclass.call(this, props);
    this.state = {};
    this._animationFrame = null;
    this.gl = null;
    autobind(this);
  }

  if ( superclass ) WebGLRenderer.__proto__ = superclass;
  WebGLRenderer.prototype = Object.create( superclass && superclass.prototype );
  WebGLRenderer.prototype.constructor = WebGLRenderer;

  WebGLRenderer.prototype.componentDidMount = function componentDidMount () {
    var canvas = this.refs.overlay;
    this._initWebGL(canvas);
    this._animationLoop();
  };

  WebGLRenderer.prototype.componentWillUnmount = function componentWillUnmount () {
    this._cancelAnimationLoop();
  };

  /**
   * Initialize LumaGL library and through it WebGL
   * @param {string} canvas
   */
  WebGLRenderer.prototype._initWebGL = function _initWebGL (canvas) {
    var ref = this.props;
    var debug = ref.debug;
    var glOptions = ref.glOptions;

    // Create context if not supplied
    var gl = this.props.gl;
    if (!gl) {
      try {
        gl = createGLContext(Object.assign({canvas: canvas, debug: debug}, glOptions));
      } catch (error) {
        this.props.onInitializationFailed(error);
        return;
      }
    }

    this.gl = gl;

    // Call callback last, in case it throws
    this.props.onRendererInitialized({canvas: canvas, gl: gl});
  };

  /**
   * Main WebGL animation loop
   */
  WebGLRenderer.prototype._animationLoop = function _animationLoop () {
    this._renderFrame();
    // Keep registering ourselves for the next animation frame
    if (typeof window !== 'undefined') {
      this._animationFrame = requestAnimationFrame(this._animationLoop);
    }
  };

  WebGLRenderer.prototype._cancelAnimationLoop = function _cancelAnimationLoop () {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
    }
  };

  // Updates WebGL viewport to latest props
  // for clean logging, only calls gl.viewport if props have changed
  WebGLRenderer.prototype._updateGLViewport = function _updateGLViewport () {
    var ref = this.props;
    var ref_viewport = ref.viewport;
    var x = ref_viewport.x;
    var y = ref_viewport.y;
    var w = ref_viewport.width;
    var h = ref_viewport.height;
    var ref$1 = this.props;
    var dpr = ref$1.pixelRatio;
    var ref$2 = this;
    var gl = ref$2.gl;

    x = x * dpr;
    y = y * dpr;
    w = w * dpr;
    h = h * dpr;

    if (x !== this.x || y !== this.y || w !== this.w || h !== this.h) {
      gl.viewport(x, y, w, h);
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
    }
  };

  WebGLRenderer.prototype._renderFrame = function _renderFrame () {
    var ref = this.props;
    var ref_viewport = ref.viewport;
    var width = ref_viewport.width;
    var height = ref_viewport.height;
    var ref$1 = this;
    var gl = ref$1.gl;

    // Check for reasons not to draw
    if (!gl || !(width > 0) || !(height > 0)) {
      return;
    }

    this._updateGLViewport();

    // Call render callback
    this.props.onRenderFrame({gl: gl});
  };

  WebGLRenderer.prototype.render = function render () {
    var ref = this.props;
    var id = ref.id;
    var width = ref.width;
    var height = ref.height;
    var pixelRatio = ref.pixelRatio;
    var style = ref.style;
    return createElement('canvas', {
      ref: 'overlay',
      key: 'overlay',
      id: id,
      width: width * pixelRatio,
      height: height * pixelRatio,
      style: Object.assign({}, style, {width: width, height: height})
    });
  };

  return WebGLRenderer;
}(React.Component));

export default WebGLRenderer;

WebGLRenderer.propTypes = propTypes;
WebGLRenderer.defaultProps = defaultProps;
