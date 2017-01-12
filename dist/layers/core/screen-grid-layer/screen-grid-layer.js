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

var defaultProps = {
  // @type {number} opts.unitWidth - width of the unit rectangle
  unitWidth: 100,
  // @type {number} opts.unitHeight - height of the unit rectangle
  unitHeight: 100,
  minColor: [0, 0, 0, 255],
  maxColor: [0, 255, 0, 255],
  getPosition: function (d) { return d.position; },
  getWeight: function (d) { return 1; }
};

var ScreenGridLayer = (function (Layer) {
  function ScreenGridLayer(props) {
    Layer.call(this, Object.assign({}, defaultProps, props));
  }

  if ( Layer ) ScreenGridLayer.__proto__ = Layer;
  ScreenGridLayer.prototype = Object.create( Layer && Layer.prototype );
  ScreenGridLayer.prototype.constructor = ScreenGridLayer;

  ScreenGridLayer.prototype.getShaders = function getShaders () {
    return {
      vs: readFileSync(join(__dirname, './screen-grid-layer-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './screen-grid-layer-fragment.glsl'), 'utf8')
    };
  };

  ScreenGridLayer.prototype.initializeState = function initializeState () {
    var ref = this.state;
    var attributeManager = ref.attributeManager;
    attributeManager.addInstanced({
      instancePositions: {size: 3, update: this.calculateInstancePositions},
      instanceCount: {size: 1, update: this.calculateInstanceCount}
    });

    var ref$1 = this.context;
    var gl = ref$1.gl;
    this.setState({model: this.getModel(gl)});
  };

  ScreenGridLayer.prototype.updateState = function updateState (ref) {
    var oldProps = ref.oldProps;
    var props = ref.props;
    var changeFlags = ref.changeFlags;

    var cellSizeChanged =
      props.unitWidth !== oldProps.unitWidth ||
      props.unitHeight !== oldProps.unitHeight;

    if (cellSizeChanged || changeFlags.viewportChanged) {
      this.updateCell();
    }
  };

  ScreenGridLayer.prototype.draw = function draw (ref) {
    var uniforms = ref.uniforms;

    var ref$1 = this.props;
    var minColor = ref$1.minColor;
    var maxColor = ref$1.maxColor;
    var ref$2 = this.state;
    var model = ref$2.model;
    var cellScale = ref$2.cellScale;
    var maxCount = ref$2.maxCount;
    var ref$3 = this.context;
    var gl = ref$3.gl;
    gl.depthMask(true);
    uniforms = Object.assign({}, uniforms, {minColor: minColor, maxColor: maxColor, cellScale: cellScale, maxCount: maxCount});
    model.render(uniforms);
  };

  ScreenGridLayer.prototype.getModel = function getModel (gl) {
    var shaders = assembleShaders(gl, this.getShaders());

    return new Model({
      gl: gl,
      id: this.props.id,
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: GL.TRIANGLE_FAN,
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
      }),
      isInstanced: true
    });
  };

  ScreenGridLayer.prototype.updateCell = function updateCell () {
    var ref = this.context.viewport;
    var width = ref.width;
    var height = ref.height;
    var ref$1 = this.props;
    var unitWidth = ref$1.unitWidth;
    var unitHeight = ref$1.unitHeight;

    var MARGIN = 2;
    var cellScale = new Float32Array([
      (unitWidth - MARGIN) / width * 2,
      -(unitHeight - MARGIN) / height * 2,
      1
    ]);
    var numCol = Math.ceil(width / unitWidth);
    var numRow = Math.ceil(height / unitHeight);

    this.setState({
      cellScale: cellScale,
      numCol: numCol,
      numRow: numRow,
      numInstances: numCol * numRow
    });

    var ref$2 = this.state;
    var attributeManager = ref$2.attributeManager;
    attributeManager.invalidateAll();
  };

  ScreenGridLayer.prototype.calculateInstancePositions = function calculateInstancePositions (attribute, ref) {
    var numInstances = ref.numInstances;

    var ref$1 = this.context.viewport;
    var width = ref$1.width;
    var height = ref$1.height;
    var ref$2 = this.props;
    var unitWidth = ref$2.unitWidth;
    var unitHeight = ref$2.unitHeight;
    var ref$3 = this.state;
    var numCol = ref$3.numCol;
    var value = attribute.value;
    var size = attribute.size;

    for (var i = 0; i < numInstances; i++) {
      var x = i % numCol;
      var y = Math.floor(i / numCol);
      value[i * size + 0] = x * unitWidth / width * 2 - 1;
      value[i * size + 1] = 1 - y * unitHeight / height * 2;
      value[i * size + 2] = 0;
    }
  };

  ScreenGridLayer.prototype.calculateInstanceCount = function calculateInstanceCount (attribute) {
    var this$1 = this;

    var ref = this.props;
    var data = ref.data;
    var unitWidth = ref.unitWidth;
    var unitHeight = ref.unitHeight;
    var getPosition = ref.getPosition;
    var getWeight = ref.getWeight;
    var ref$1 = this.state;
    var numCol = ref$1.numCol;
    var numRow = ref$1.numRow;
    var value = attribute.value;
    var maxCount = 0;

    value.fill(0.0);

    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var point = list[i$1];

      var pixel = this$1.project(getPosition(point));
      var colId = Math.floor(pixel[0] / unitWidth);
      var rowId = Math.floor(pixel[1] / unitHeight);
      if (colId >= 0 && colId < numCol && rowId >= 0 && rowId < numRow) {
        var i = colId + rowId * numCol;
        value[i] += getWeight(point);
        if (value[i] > maxCount) {
          maxCount = value[i];
        }
      }
    }

    this.setState({maxCount: maxCount});
  };

  return ScreenGridLayer;
}(Layer));

export default ScreenGridLayer;

ScreenGridLayer.layerName = 'ScreenGridLayer';
