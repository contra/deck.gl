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
import {fp64ify} from '../../../lib/utils/fp64';
import {GL, Model, Geometry} from 'luma.gl';
import {readFileSync} from 'fs';
import {join} from 'path';

var DEFAULT_COLOR = [0, 255, 0, 255];

var defaultGetSourcePosition = function (x) { return x.sourcePosition; };
var defaultGetTargetPosition = function (x) { return x.targetPosition; };
var defaultGetColor = function (x) { return x.color || DEFAULT_COLOR; };

var defaultProps = {
  getSourcePosition: defaultGetSourcePosition,
  getTargetPosition: defaultGetTargetPosition,
  getColor: defaultGetColor,
  strokeWidth: 1
};

var LineLayer64 = (function (Layer) {
  function LineLayer64(props) {
    Layer.call(this, Object.assign({}, defaultProps, props));
  }

  if ( Layer ) LineLayer64.__proto__ = Layer;
  LineLayer64.prototype = Object.create( Layer && Layer.prototype );
  LineLayer64.prototype.constructor = LineLayer64;

  LineLayer64.prototype.initializeState = function initializeState () {
    var ref = this.context;
    var gl = ref.gl;
    this.setState({model: this.createModel(gl)});

    var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;
    attributeManager.addInstanced({
      instanceSourcePositionsFP64: {
        size: 4,
        update: this.calculateInstanceSourcePositions
      },
      instanceTargetPositionsFP64: {
        size: 4,
        update: this.calculateInstanceTargetPositions
      },
      instanceElevations: {
        size: 2,
        update: this.calculateInstanceElevations
      },
      instanceColors: {
        size: 4,
        type: GL.UNSIGNED_BYTE,
        update: this.calculateInstanceColors
      }
    });
  };

  LineLayer64.prototype.draw = function draw (ref) {
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

  LineLayer64.prototype.getShaders = function getShaders () {
    return {
      vs: readFileSync(join(__dirname, './line-layer-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './line-layer-fragment.glsl'), 'utf8'),
      fp64: true,
      project64: true
    };
  };

  LineLayer64.prototype.createModel = function createModel (gl) {
    var positions = [0, 0, 0, 1, 1, 1];

    var shaders = assembleShaders(gl, this.getShaders());

    return new Model({
      gl: gl,
      id: this.props.id,
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: GL.LINE_STRIP,
        positions: new Float32Array(positions)
      }),
      isInstanced: true
    });
  };

  LineLayer64.prototype.calculateInstanceSourcePositions = function calculateInstanceSourcePositions (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getSourcePosition = ref.getSourcePosition;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var object = list[i$1];

      var sourcePosition = getSourcePosition(object);
      var assign;
      (assign = fp64ify(sourcePosition[0]), value[i + 0] = assign[0], value[i + 1] = assign[1]);
      var assign$1;
      (assign$1 = fp64ify(sourcePosition[1]), value[i + 2] = assign$1[0], value[i + 3] = assign$1[1]);
      i += size;
    }
  };

  LineLayer64.prototype.calculateInstanceTargetPositions = function calculateInstanceTargetPositions (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getTargetPosition = ref.getTargetPosition;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var object = list[i$1];

      var targetPosition = getTargetPosition(object);
      var assign;
      (assign = fp64ify(targetPosition[0]), value[i + 0] = assign[0], value[i + 1] = assign[1]);
      var assign$1;
      (assign$1 = fp64ify(targetPosition[1]), value[i + 2] = assign$1[0], value[i + 3] = assign$1[1]);
      i += size;
    }
  };

  LineLayer64.prototype.calculateInstanceElevations = function calculateInstanceElevations (attribute) {
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
      value[i + 0] = sourcePosition[2] || 0;
      value[i + 1] = targetPosition[2] || 0;
      i += size;
    }
  };

  LineLayer64.prototype.calculateInstanceColors = function calculateInstanceColors (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getColor = ref.getColor;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var object = list[i$1];

      var color = getColor(object);
      value[i + 0] = color[0];
      value[i + 1] = color[1];
      value[i + 2] = color[2];
      value[i + 3] = isNaN(color[3]) ? DEFAULT_COLOR[3] : color[3];
      i += size;
    }
  };

  return LineLayer64;
}(Layer));

export default LineLayer64;

LineLayer64.layerName = 'LineLayer64';
