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

var DEFAULT_COLOR = [0, 0, 255, 255];

var defaultProps = {
  strokeWidth: 1,
  getSourcePosition: function (x) { return x.sourcePosition; },
  getTargetPosition: function (x) { return x.targetPosition; },
  getSourceColor: function (x) { return x.color; },
  getTargetColor: function (x) { return x.color; }
};

var ArcLayer = (function (Layer) {
  function ArcLayer(props) {
    Layer.call(this, Object.assign({}, defaultProps, props));
  }

  if ( Layer ) ArcLayer.__proto__ = Layer;
  ArcLayer.prototype = Object.create( Layer && Layer.prototype );
  ArcLayer.prototype.constructor = ArcLayer;

  ArcLayer.prototype.initializeState = function initializeState () {
    var ref = this.context;
    var gl = ref.gl;
    this.setState({model: this._createModel(gl)});

    var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;
    attributeManager.addInstanced({
      instancePositions: {size: 4, update: this.calculateInstancePositions},
      instanceSourceColors: {
        type: GL.UNSIGNED_BYTE,
        size: 4,
        update: this.calculateInstanceSourceColors
      },
      instanceTargetColors: {
        type: GL.UNSIGNED_BYTE,
        size: 4,
        update: this.calculateInstanceTargetColors
      }
    });
  };

  ArcLayer.prototype.draw = function draw (ref) {
    var uniforms = ref.uniforms;

    var ref$1 = this.context;
    var gl = ref$1.gl;
    var lineWidth = this.screenToDevicePixels(this.props.strokeWidth);
    gl.lineWidth(lineWidth);
    this.state.model.render(uniforms);
    // Setting line width back to 1 is here to workaround a Google Chrome bug
    // gl.clear() and gl.isEnabled() will return GL_INVALID_VALUE even with
    // correct parameter
    // This is not happening on Safari and Firefox
    gl.lineWidth(1.0);
  };

  ArcLayer.prototype.getShaders = function getShaders () {
    return {
      vs: readFileSync(join(__dirname, './arc-layer-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './arc-layer-fragment.glsl'), 'utf8')
    };
  };

  ArcLayer.prototype._createModel = function _createModel (gl) {
    var positions = [];
    var NUM_SEGMENTS = 50;
    for (var i = 0; i < NUM_SEGMENTS; i++) {
      positions = positions.concat( [i], [i], [i]);
    }

    var shaders = assembleShaders(gl, this.getShaders());

    return new Model({
      gl: gl,
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: GL.LINE_STRIP,
        positions: new Float32Array(positions)
      }),
      isInstanced: true
    });
  };

  ArcLayer.prototype.calculateInstancePositions = function calculateInstancePositions (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getSourcePosition = ref.getSourcePosition;
    var getTargetPosition = ref.getTargetPosition;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var object = list[i$1];

      var sourcePosition = getSourcePosition(object);
      var targetPosition = getTargetPosition(object);
      value[i + 0] = sourcePosition[0];
      value[i + 1] = sourcePosition[1];
      value[i + 2] = targetPosition[0];
      value[i + 3] = targetPosition[1];
      i += size;
    }
  };

  ArcLayer.prototype.calculateInstanceSourceColors = function calculateInstanceSourceColors (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getSourceColor = ref.getSourceColor;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var object = list[i$1];

      var color = getSourceColor(object) || DEFAULT_COLOR;
      value[i + 0] = color[0];
      value[i + 1] = color[1];
      value[i + 2] = color[2];
      value[i + 3] = isNaN(color[3]) ? DEFAULT_COLOR[3] : color[3];
      i += size;
    }
  };

  ArcLayer.prototype.calculateInstanceTargetColors = function calculateInstanceTargetColors (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getTargetColor = ref.getTargetColor;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var object = list[i$1];

      var color = getTargetColor(object) || DEFAULT_COLOR;
      value[i + 0] = color[0];
      value[i + 1] = color[1];
      value[i + 2] = color[2];
      value[i + 3] = isNaN(color[3]) ? DEFAULT_COLOR[3] : color[3];
      i += size;
    }
  };

  return ArcLayer;
}(Layer));

export default ArcLayer;

ArcLayer.layerName = 'ArcLayer';
