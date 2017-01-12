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
import flattenDeep from 'lodash.flattendeep';
import normalize from 'geojson-normalize';
import earcut from 'earcut';
import {readFileSync} from 'fs';
import {join} from 'path';

var DEFAULT_COLOR = [0, 0, 255, 255];

var defaultProps = {
  getColor: function (feature) { return feature.properties.color || DEFAULT_COLOR; },
  drawCountour: false,
  strokeWidth: 1
};

var ChoroplethLayer64 = (function (Layer) {
  function ChoroplethLayer64(props) {
    Layer.call(this, Object.assign({}, defaultProps, props));
  }

  if ( Layer ) ChoroplethLayer64.__proto__ = Layer;
  ChoroplethLayer64.prototype = Object.create( Layer && Layer.prototype );
  ChoroplethLayer64.prototype.constructor = ChoroplethLayer64;

  ChoroplethLayer64.prototype.initializeState = function initializeState () {
    var ref = this.context;
    var gl = ref.gl;
    var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;

    attributeManager.addDynamic({
      // Primtive attributes
      indices: {size: 1, update: this.calculateIndices, isIndexed: true},
      positionsFP64: {size: 4, update: this.calculatePositionsFP64},
      heightsFP64: {size: 2, update: this.calculateHeightsFP64},
      colors: {
        size: 4,
        type: GL.UNSIGNED_BYTE,
        update: this.calculateColors
      },
      // Instanced attributes
      pickingColors:
        {size: 3, update: this.calculatePickingColors, noAlloc: true}
    });

    var IndexType = gl.getExtension('OES_element_index_uint') ?
      Uint32Array : Uint16Array;

    this.setState({
      model: this.getModel(gl),
      numInstances: 0,
      IndexType: IndexType
    });
  };

  ChoroplethLayer64.prototype.updateState = function updateState (ref) {
    var oldProps = ref.oldProps;
    var props = ref.props;
    var changeFlags = ref.changeFlags;

    var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;
    if (changeFlags.dataChanged) {
      this.state.choropleths = extractChoropleths(props.data);
      attributeManager.invalidateAll();
    }

    if (oldProps.opacity !== props.opacity) {
      this.setUniforms({opacity: props.opacity});
    }
  };

  ChoroplethLayer64.prototype.draw = function draw (ref) {
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

  ChoroplethLayer64.prototype.pick = function pick (opts) {
    Layer.prototype.pick.call(this, opts);
    var info = opts.info;
    var index = this.decodePickingColor(info.color);
    var feature = index >= 0 ? this.props.data.features[index] : null;
    info.feature = feature;
    info.object = feature;
  };

  ChoroplethLayer64.prototype.getShaders = function getShaders () {
    return {
      vs: readFileSync(join(__dirname, './choropleth-layer-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './choropleth-layer-fragment.glsl'), 'utf8'),
      fp64: true,
      project64: true
    };
  };

  ChoroplethLayer64.prototype.getModel = function getModel (gl) {
    var shaders = assembleShaders(gl, this.getShaders());

    return new Model({
      gl: gl,
      id: this.props.id,
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: this.props.drawContour ? GL.LINES : GL.TRIANGLES
      }),
      vertexCount: 0,
      isIndexed: true
    });
  };

  ChoroplethLayer64.prototype.calculateIndices = function calculateIndices (attribute) {
    var this$1 = this;

    // adjust index offset for multiple choropleths
    var offsets = this.state.choropleths.reduce(
      function (acc, choropleth) { return acc.concat( [acc[acc.length - 1] +
        choropleth.reduce(function (count, polygon) { return count + polygon.length; }, 0)]); },
      [0]
    );
    var ref = this.state;
    var IndexType = ref.IndexType;
    if (IndexType === Uint16Array && offsets[offsets.length - 1] > 65535) {
      throw new Error('Vertex count exceeds browser\'s limit');
    }

    var indices = this.state.choropleths.map(
      function (choropleth, choroplethIndex) { return this$1.props.drawContour ?
        // 1. get sequentially ordered indices of each choropleth contour
        // 2. offset them by the number of indices in previous choropleths
        calculateContourIndices(choropleth).map(
          function (index) { return index + offsets[choroplethIndex]; }
        ) :
        // 1. get triangulated indices for the internal areas
        // 2. offset them by the number of indices in previous choropleths
        calculateSurfaceIndices(choropleth).map(
          function (index) { return index + offsets[choroplethIndex]; }
        ); }
    );

    attribute.value = new IndexType(flattenDeep(indices));
    attribute.target = GL.ELEMENT_ARRAY_BUFFER;
    this.state.model.setVertexCount(attribute.value.length / attribute.size);
  };

  ChoroplethLayer64.prototype.calculatePositionsFP64 = function calculatePositionsFP64 (attribute) {
    var vertices = flattenDeep(this.state.choropleths);
    attribute.value = new Float32Array(vertices.length / 3 * 4);
    for (var index = 0; index < vertices.length / 3; index++) {
      var assign;
      (assign = fp64ify(vertices[index * 3]), attribute.value[index * 4] = assign[0], attribute.value[index * 4 + 1] = assign[1]);
      var assign$1;
      (assign$1 = fp64ify(vertices[index * 3 + 1]), attribute.value[index * 4 + 2] = assign$1[0], attribute.value[index * 4 + 3] = assign$1[1]);
    }
  };

  ChoroplethLayer64.prototype.calculateHeightsFP64 = function calculateHeightsFP64 (attribute) {
    var vertices = flattenDeep(this.state.choropleths);
    attribute.value = new Float32Array(vertices.length / 3 * 2);
    for (var index = 0; index < vertices.length / 3; index++) {
      var assign;
      (assign = fp64ify(vertices[index * 3 + 2]), attribute.value[index * 2] = assign[0], attribute.value[index * 2 + 1] = assign[1]);
    }
  };

  ChoroplethLayer64.prototype.calculateColors = function calculateColors (attribute) {
    var ref = this.props;
    var features = ref.data.features;
    var getColor = ref.getColor;

    var colors = this.state.choropleths.map(
      function (choropleth, choroplethIndex) {
        var feature = features[choropleth.featureIndex];
        var color = getColor(feature) || DEFAULT_COLOR;

        if (isNaN(color[3])) {
          color[3] = DEFAULT_COLOR[3];
        }

        return choropleth.map(function (polygon) { return polygon.map(function (vertex) { return color; }); }
        );
      }
    );

    attribute.value = new Uint8Array(flattenDeep(colors));
  };

  // Override the default picking colors calculation
  ChoroplethLayer64.prototype.calculatePickingColors = function calculatePickingColors (attribute) {
    var this$1 = this;


    var colors = this.state.choropleths.map(
      function (choropleth, choroplethIndex) {
        var featureIndex = choropleth.featureIndex;
        var color = this$1.props.drawContour ?
          this$1.nullPickingColor() :
          this$1.encodePickingColor(featureIndex);
        return choropleth.map(function (polygon) { return polygon.map(function (vertex) { return color; }); }
        );
      }
    );

    attribute.value = new Uint8Array(flattenDeep(colors));
  };

  return ChoroplethLayer64;
}(Layer));

export default ChoroplethLayer64;

ChoroplethLayer64.layerName = 'ChoroplethLayer64';

/*
 * converts list of features from a GeoJSON object to a list of GeoJSON
 * polygon-style coordinates
 * @param {Object} data - geojson object
 * @returns {[Number,Number,Number][][][]} array of choropleths
 */
function extractChoropleths(data) {
  var normalizedGeojson = normalize(data);
  var result = [];

  normalizedGeojson.features.map(function (feature, featureIndex) {
    var choropleths = featureToChoropleths(feature);
    choropleths.forEach(function (choropleth) {
      choropleth.featureIndex = featureIndex;
    });
    result.push.apply(result, choropleths);
  });
  return result;
}

/*
 * converts one GeoJSON features from object to a list of GeoJSON polygon-style
 * coordinates
 * @param {Object} data - geojson object
 * @returns {[Number,Number,Number][][][]} array of choropleths
 */
function featureToChoropleths(feature) {
  var ref = feature.geometry;
  var coordinates = ref.coordinates;
  var type = ref.type;
  var choropleths;

  switch (type) {
  case 'MultiPolygon':
    choropleths = coordinates;
    break;
  case 'Polygon':
    choropleths = [coordinates];
    break;
  case 'LineString':
    // create a LineStringLayer for LineString and MultiLineString?
    choropleths = [[coordinates]];
    break;
  case 'MultiLineString':
    choropleths = coordinates.map(function (coords) { return [coords]; });
    break;
  default:
    choropleths = [];
  }
  return choropleths.map(
    function (choropleth) { return choropleth.map(
      function (polygon) { return polygon.map(
        function (coordinate) { return [coordinate[0], coordinate[1], coordinate[2] || 0]; }
      ); }
    ); }
  );
}

/*
 * get vertex indices for drawing choropleth contour
 * @param {[Number,Number,Number][][]} choropleth
 * @returns {[Number]} indices
 */
function calculateContourIndices(choropleth) {
  var offset = 0;

  return choropleth.reduce(function (acc, polygon) {
    var numVertices = polygon.length;

    // use vertex pairs for gl.LINES => [0, 1, 1, 2, 2, ..., n-2, n-2, n-1]
    var indices = acc.concat( [offset]);
    for (var i = 1; i < numVertices - 1; i++) {
      indices.push(i + offset, i + offset);
    }
    indices.push(offset + numVertices - 1);

    offset += numVertices;
    return indices;
  }, []);
}

/*
 * get vertex indices for drawing choropleth mesh
 * @param {[Number,Number,Number][][]} choropleth
 * @returns {[Number]} indices
 */
function calculateSurfaceIndices(choropleth) {
  var holes = null;

  if (choropleth.length > 1) {
    holes = choropleth.reduce(
      function (acc, polygon) { return acc.concat( [acc[acc.length - 1] + polygon.length]); },
      [0]
    ).slice(1, choropleth.length);
  }

  return earcut(flattenDeep(choropleth), holes, 3);
}
