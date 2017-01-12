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

import {Layer} from '../../../lib';
import {assembleShaders} from '../../../shader-utils';
import {GL, Model, Geometry} from 'luma.gl';
import {readFileSync} from 'fs';
import {join} from 'path';

var DEFAULT_RADIUS = 30;
var DEFAULT_COLOR = [255, 0, 255, 255];

var defaultGetPosition = function (x) { return x.position; };
var defaultGetRadius = function (x) { return x.radius || DEFAULT_RADIUS; };
var defaultGetColor = function (x) { return x.color || DEFAULT_COLOR; };

var defaultProps = {
  getPosition: defaultGetPosition,
  getRadius: defaultGetRadius,
  getColor: defaultGetColor,
  radius: 30,  //  point radius in meters
  radiusMinPixels: 0, //  min point radius in pixels
  radiusMaxPixels: Number.MAX_SAFE_INTEGER, // max point radius in pixels
  drawOutline: false,
  strokeWidth: 1
};

var ScatterplotLayer = (function (Layer) {
  function ScatterplotLayer(props) {
    Layer.call(this, Object.assign({}, defaultProps, props));
  }

  if ( Layer ) ScatterplotLayer.__proto__ = Layer;
  ScatterplotLayer.prototype = Object.create( Layer && Layer.prototype );
  ScatterplotLayer.prototype.constructor = ScatterplotLayer;

  ScatterplotLayer.prototype.getShaders = function getShaders (id) {
    return {
      vs: readFileSync(join(__dirname, './scatterplot-layer-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './scatterplot-layer-fragment.glsl'), 'utf8')
    };
  };

  ScatterplotLayer.prototype.initializeState = function initializeState () {
    /* eslint-disable */
    var ref = this.context;
    var gl = ref.gl;
    var model = this._getModel(gl);
    this.setState({model: model});

    var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;
    attributeManager.addInstanced({
      instancePositions: {size: 3, update: this.calculateInstancePositions},
      instanceRadius: {size: 1, update: this.calculateInstanceRadius},
      instanceColors: {size: 4, type: GL.UNSIGNED_BYTE, update: this.calculateInstanceColors}
    });
  };

  ScatterplotLayer.prototype.updateState = function updateState (evt) {
    Layer.prototype.updateState.call(this, evt);
    var props = evt.props;
    var oldProps = evt.oldProps;
    if (props.drawOutline !== oldProps.drawOutline) {
      this.state.model.geometry.drawMode =
        props.drawOutline ? GL.LINE_LOOP : GL.TRIANGLE_FAN;
    }
  };

  ScatterplotLayer.prototype.draw = function draw (ref) {
    var uniforms = ref.uniforms;

    var ref$1 = this.context;
    var gl = ref$1.gl;
    var lineWidth = this.screenToDevicePixels(this.props.strokeWidth);
    gl.lineWidth(lineWidth);
    this.state.model.render(Object.assign({}, uniforms, {
      radius: this.props.radius,
      radiusMinPixels: this.props.radiusMinPixels,
      radiusMaxPixels: this.props.radiusMaxPixels
    }));
    // Setting line width back to 1 is here to workaround a Google Chrome bug
    // gl.clear() and gl.isEnabled() will return GL_INVALID_VALUE even with
    // correct parameter
    // This is not happening on Safari and Firefox
    gl.lineWidth(1.0);
  };

  ScatterplotLayer.prototype._getModel = function _getModel (gl) {
    var NUM_SEGMENTS = 16;
    var positions = [];
    for (var i = 0; i < NUM_SEGMENTS; i++) {
      positions.push(
        Math.cos(Math.PI * 2 * i / NUM_SEGMENTS),
        Math.sin(Math.PI * 2 * i / NUM_SEGMENTS),
        0
      );
    }
    /* eslint-disable */


    var shaders = assembleShaders(gl, this.getShaders());

    return new Model({
      gl: gl,
      id: this.props.id,
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: GL.TRIANGLE_FAN,
        positions: new Float32Array(positions)
      }),
      isInstanced: true
    });
    return model;
  };

  ScatterplotLayer.prototype.calculateInstancePositions = function calculateInstancePositions (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getPosition = ref.getPosition;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var point = list[i$1];

      var position = getPosition(point);
      value[i + 0] = position[0] || 0;
      value[i + 1] = position[1] || 0;
      value[i + 2] = position[2] || 0;
      i += size;
    }
  };

  ScatterplotLayer.prototype.calculateInstanceRadius = function calculateInstanceRadius (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getRadius = ref.getRadius;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var point = list[i$1];

      var radius = getRadius(point);
      value[i + 0] = isNaN(radius) ? 1 : radius;
      i += size;
    }
  };

  ScatterplotLayer.prototype.calculateInstanceColors = function calculateInstanceColors (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getColor = ref.getColor;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var point = list[i$1];

      var color = getColor(point);
      value[i + 0] = color[0] || 0;
      value[i + 1] = color[1] || 0;
      value[i + 2] = color[2] || 0;
      value[i + 3] = isNaN(color[3]) ? DEFAULT_COLOR[3] : color[3];
      i += size;
    }
  };

  return ScatterplotLayer;
}(Layer));

export default ScatterplotLayer;

ScatterplotLayer.layerName = 'ScatterplotLayer';
