// Copyright (c) 2016 Uber Technologies, Inc.
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

import ScatterplotLayer from '../../core/scatterplot-layer';
import {fp64ify} from '../../../lib/utils/fp64';
import {readFileSync} from 'fs';
import {join} from 'path';

var ScatterplotLayer64 = (function (ScatterplotLayer) {
  function ScatterplotLayer64 () {
    ScatterplotLayer.apply(this, arguments);
  }

  if ( ScatterplotLayer ) ScatterplotLayer64.__proto__ = ScatterplotLayer;
  ScatterplotLayer64.prototype = Object.create( ScatterplotLayer && ScatterplotLayer.prototype );
  ScatterplotLayer64.prototype.constructor = ScatterplotLayer64;

  ScatterplotLayer64.prototype.getShaders = function getShaders (id) {
    return {
      vs: readFileSync(join(__dirname, './scatterplot-layer-64-vertex.glsl'), 'utf8'),
      fs: ScatterplotLayer.prototype.getShaders.call(this).fs,
      fp64: true,
      project64: true
    };
  };

  ScatterplotLayer64.prototype.initializeState = function initializeState () {
    // We use the model and all attributes except "instancePositions" of the base layer
    ScatterplotLayer.prototype.initializeState.call(this);

    // Add the 64 bit positions
    var ref = this.state;
    var attributeManager = ref.attributeManager;
    attributeManager.addInstanced({
      instancePositions64xy: {size: 4, update: this.calculateInstancePositions64xy},
      instancePositions64z: {size: 2, update: this.calculateInstancePositions64z}
      // Reusing from base class
      // instanceRadius: {size: 1, update: this.calculateInstanceRadius},
      // instanceColors: {size: 4, type: GL.UNSIGNED_BYTE, update: this.calculateInstanceColors}
    });
  };

  ScatterplotLayer64.prototype.calculateInstancePositions64xy = function calculateInstancePositions64xy (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getPosition = ref.getPosition;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var point = list[i$1];

      var position = getPosition(point);
      var assign;
      (assign = fp64ify(position[0]), value[i + 0] = assign[0], value[i + 1] = assign[1]);
      var assign$1;
      (assign$1 = fp64ify(position[1]), value[i + 2] = assign$1[0], value[i + 3] = assign$1[1]);
      i += size;
    }
  };

  ScatterplotLayer64.prototype.calculateInstancePositions64z = function calculateInstancePositions64z (attribute) {
    var ref = this.props;
    var data = ref.data;
    var getPosition = ref.getPosition;
    var value = attribute.value;
    var size = attribute.size;
    var i = 0;
    for (var i$1 = 0, list = data; i$1 < list.length; i$1 += 1) {
      var point = list[i$1];

      var position = getPosition(point);
      var assign;
      (assign = fp64ify(position[2] || 0), value[i + 0] = assign[0], value[i + 1] = assign[1]);
      i += size;
    }
  };

  return ScatterplotLayer64;
}(ScatterplotLayer));

export default ScatterplotLayer64;

ScatterplotLayer64.layerName = 'ScatterplotLayer64';
