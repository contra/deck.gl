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
import earcut from 'earcut';
import {vec3} from 'gl-matrix';
import {readFileSync} from 'fs';
import {join} from 'path';

var DEFAULT_COLOR = [180, 180, 200];
var DEFAULT_AMBIENT_COLOR = [255, 255, 255];
var DEFAULT_POINTLIGHT_AMBIENT_COEFFICIENT = 0.1;
var DEFAULT_POINTLIGHT_LOCATION = [40.4406, -79.9959, 100];
var DEFAULT_POINTLIGHT_COLOR = [255, 255, 255];
var DEFAULT_POINTLIGHT_ATTENUATION = 1.0;
var DEFAULT_MATERIAL_SPECULAR_COLOR = [255, 255, 255];
var DEFAULT_MATERIAL_SHININESS = 1;

var defaultProps = {
  opacity: 1,
  elevation: 1
};

var ExtrudedChoroplethLayer64 = (function (Layer) {
  function ExtrudedChoroplethLayer64(props) {
    Layer.call(this, Object.assign({}, defaultProps, props));
  }

  if ( Layer ) ExtrudedChoroplethLayer64.__proto__ = Layer;
  ExtrudedChoroplethLayer64.prototype = Object.create( Layer && Layer.prototype );
  ExtrudedChoroplethLayer64.prototype.constructor = ExtrudedChoroplethLayer64;

  ExtrudedChoroplethLayer64.prototype.initializeState = function initializeState () {
    var ref = this.state;
    var attributeManager = ref.attributeManager;
    attributeManager.add({
      indices: {size: 1, isIndexed: true, update: this.calculateIndices},
      positions: {size: 4, update: this.calculatePositions},
      heights: {size: 2, update: this.calculateHeights},
      normals: {size: 3, update: this.calculateNormals},
      colors: {size: 3, update: this.calculateColors}
    });

    var ref$1 = this.context;
    var gl = ref$1.gl;
    this.setState({
      numInstances: 0,
      model: this.getModel(gl)
    });
  };

  ExtrudedChoroplethLayer64.prototype.updateState = function updateState (ref) {
    var changeFlags = ref.changeFlags;

    var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;
    if (changeFlags.dataChanged) {
      this.extractExtrudedChoropleth();
      attributeManager.invalidateAll();
    }

    var ref$2 = this.props;
    var elevation = ref$2.elevation;
    var color = ref$2.color;
    var ambientColor = ref$2.ambientColor;
    var pointLightColor = ref$2.pointLightColor;
    var pointLightLocation = ref$2.pointLightLocation;
    var pointLightAmbientCoefficient = ref$2.pointLightAmbientCoefficient;
    var pointLightAttenuation = ref$2.pointLightAttenuation;
    var materialSpecularColor = ref$2.materialSpecularColor;
    var materialShininess = ref$2.materialShininess;

    this.setUniforms({
      elevation: Number.isFinite(elevation) ? elevation : 1,
      colors: color || DEFAULT_COLOR,
      uAmbientColor: ambientColor || DEFAULT_AMBIENT_COLOR,
      uPointLightAmbientCoefficient:
        pointLightAmbientCoefficient || DEFAULT_POINTLIGHT_AMBIENT_COEFFICIENT,
      uPointLightLocation: pointLightLocation || DEFAULT_POINTLIGHT_LOCATION,
      uPointLightColor: pointLightColor || DEFAULT_POINTLIGHT_COLOR,
      uPointLightAttenuation: pointLightAttenuation || DEFAULT_POINTLIGHT_ATTENUATION,
      uMaterialSpecularColor: materialSpecularColor || DEFAULT_MATERIAL_SPECULAR_COLOR,
      uMaterialShininess: materialShininess || DEFAULT_MATERIAL_SHININESS
    });
  };

  ExtrudedChoroplethLayer64.prototype.draw = function draw (ref) {
    var uniforms = ref.uniforms;

    this.state.model.render(uniforms);
  };

  ExtrudedChoroplethLayer64.prototype.pick = function pick (opts) {
    Layer.prototype.pick.call(this, opts);
    var info = opts.info;
    var index = this.decodePickingColor(info.color);
    var feature = index >= 0 ? this.props.data.features[index] : null;
    info.feature = feature;
    info.object = feature;
  };

  ExtrudedChoroplethLayer64.prototype.getShaders = function getShaders () {
    return {
      vs: readFileSync(join(__dirname, './extruded-choropleth-layer-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './extruded-choropleth-layer-fragment.glsl'), 'utf8'),
      fp64: true,
      project64: true
    };
  };

  ExtrudedChoroplethLayer64.prototype.getModel = function getModel (gl) {
    // Make sure we have 32 bit support
    // TODO - this could be done automatically by luma in "draw"
    // when it detects 32 bit indices
    if (!gl.getExtension('OES_element_index_uint')) {
      throw new Error('Extruded choropleth layer needs 32 bit indices');
    }

    // Buildings are 3d so depth test should be enabled
    // TODO - it is a little heavy handed to have a layer set this
    // Alternatively, check depth test and warn if not set, or add a prop
    // setDepthTest that is on by default.
    gl.enable(GL.DEPTH_TEST);
    gl.depthFunc(GL.LEQUAL);

    var shaders = assembleShaders(gl, this.getShaders());

    return new Model({
      gl: gl,
      id: this.props.id,
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: this.props.drawWireframe ? GL.LINES : GL.TRIANGLES
      }),
      vertexCount: 0,
      isIndexed: true
    });
  };

  // each top vertex is on 3 surfaces
  // each bottom vertex is on 2 surfaces
  ExtrudedChoroplethLayer64.prototype.calculatePositions = function calculatePositions (attribute) {
    var this$1 = this;

    var ref = this.state;
    var positions = ref.positions;
    if (!positions) {
      positions = flattenDeep(this.state.groupedVertices.map(
        function (vertices) {
          var topVertices = Array.prototype.concat.apply([], vertices);
          var baseVertices = topVertices.map(function (v) { return [v[0], v[1], 0]; });
          return this$1.props.drawWireframe ? [topVertices, baseVertices] :
            [topVertices, topVertices, topVertices, baseVertices, baseVertices];
        }
      ));
    }

    attribute.value = new Float32Array(positions.length / 3 * 4);

    for (var i = 0; i < positions.length / 3; i++) {
      var assign;
      (assign = fp64ify(positions[i * 3 + 0]), attribute.value[i * 4 + 0] = assign[0], attribute.value[i * 4 + 1] = assign[1]);
      var assign$1;
      (assign$1 = fp64ify(positions[i * 3 + 1]), attribute.value[i * 4 + 2] = assign$1[0], attribute.value[i * 4 + 3] = assign$1[1]);
    }
  };

  ExtrudedChoroplethLayer64.prototype.calculateHeights = function calculateHeights (attribute) {
    var this$1 = this;

    var ref = this.state;
    var positions = ref.positions;
    if (!positions) {
      positions = flattenDeep(this.state.groupedVertices.map(
        function (vertices) {
          var topVertices = Array.prototype.concat.apply([], vertices);
          var baseVertices = topVertices.map(function (v) { return [v[0], v[1], 0]; });
          return this$1.props.drawWireframe ? [topVertices, baseVertices] :
            [topVertices, topVertices, topVertices, baseVertices, baseVertices];
        }
      ));
    }

    attribute.value = new Float32Array(positions.length / 3 * 2);
    for (var i = 0; i < positions.length / 3; i++) {
      var assign;
      (assign = fp64ify(positions[i * 3 + 2] + 0.1), attribute.value[i * 2 + 0] = assign[0], attribute.value[i * 2 + 1] = assign[1]);
    }
  };

  ExtrudedChoroplethLayer64.prototype.calculateNormals = function calculateNormals (attribute) {
    var this$1 = this;

    var up = [0, 1, 0];

    var normals = this.state.groupedVertices.map(
      function (vertices, buildingIndex) {
        var topNormals = new Array(countVertices(vertices)).fill(up);
        var sideNormals = vertices.map(function (polygon) { return this$1.calculateSideNormals(polygon); });
        var sideNormalsForward = sideNormals.map(function (n) { return n[0]; });
        var sideNormalsBackward = sideNormals.map(function (n) { return n[1]; });

        return this$1.props.drawWireframe ? [topNormals, topNormals] :
        [topNormals, sideNormalsForward, sideNormalsBackward,
          sideNormalsForward, sideNormalsBackward];
      }
    );

    attribute.value = new Float32Array(flattenDeep(normals));
  };

  ExtrudedChoroplethLayer64.prototype.calculateSideNormals = function calculateSideNormals (vertices) {
    var numVertices = vertices.length;
    var normals = [];

    for (var i = 0; i < numVertices - 1; i++) {
      var n = getNormal(vertices[i], vertices[i + 1]);
      normals.push(n);
    }

    return [
      normals.concat( [normals[0]]),
      [normals[0] ].concat( normals)
    ];
  };

  ExtrudedChoroplethLayer64.prototype.calculateIndices = function calculateIndices (attribute) {
    var this$1 = this;

    // adjust index offset for multiple buildings
    var multiplier = this.props.drawWireframe ? 2 : 5;
    var offsets = this.state.groupedVertices.reduce(
      function (acc, vertices) { return acc.concat( [acc[acc.length - 1] + countVertices(vertices) * multiplier]); },
      [0]
    );

    var indices = this.state.groupedVertices.map(
      function (vertices, buildingIndex) { return this$1.props.drawWireframe ?
        // 1. get sequentially ordered indices of each building wireframe
        // 2. offset them by the number of indices in previous buildings
        this$1.calculateContourIndices(vertices, offsets[buildingIndex]) :
        // 1. get triangulated indices for the internal areas
        // 2. offset them by the number of indices in previous buildings
        this$1.calculateSurfaceIndices(vertices, offsets[buildingIndex]); }
    );

    attribute.value = new Uint32Array(flattenDeep(indices));
    attribute.target = GL.ELEMENT_ARRAY_BUFFER;
    this.state.model.setVertexCount(attribute.value.length / attribute.size);
  };

  ExtrudedChoroplethLayer64.prototype.calculateColors = function calculateColors (attribute) {
    var this$1 = this;

    var colors = this.state.groupedVertices.map(
      function (vertices, buildingIndex) {
        var ref = this$1.props;
        var color = ref.color;
        var baseColor = Array.isArray(color) ? color[0] : color;
        var topColor = Array.isArray(color) ?
          color[color.length - 1] : color;
        var numVertices = countVertices(vertices);

        var topColors = new Array(numVertices).fill(topColor);
        var baseColors = new Array(numVertices).fill(baseColor);
        return this$1.props.drawWireframe ? [topColors, baseColors] :
          [topColors, topColors, topColors, baseColors, baseColors];
      }
    );
    attribute.value = new Float32Array(flattenDeep(colors));
  };

  ExtrudedChoroplethLayer64.prototype.extractExtrudedChoropleth = function extractExtrudedChoropleth () {
    var this$1 = this;

    var ref = this.props;
    var data = ref.data;
    // Generate a flat list of buildings
    this.state.buildings = [];
    var loop = function () {
      var building = list[i];

      var properties = building.properties;
      var geometry = building.geometry;
      var coordinates = geometry.coordinates;
      var type = geometry.type;
      if (!properties.height) {
        properties.height = Math.random() * 1000;
      }
      switch (type) {
      case 'MultiPolygon':
        // Maps to multiple buildings
        var buildings = coordinates.map(
          function (coords) { return ({coordinates: coords, properties: properties}); }
        );
        (ref$1 = this$1.state.buildings).push.apply(ref$1, buildings);
        break;
      case 'Polygon':
        // Maps to a single building
        this$1.state.buildings.push({coordinates: coordinates, properties: properties});
        break;
      default:
        // We are ignoring Points for now
      }
    };

    for (var i = 0, list = data.features; i < list.length; i += 1) loop();

    // Generate vertices for the building list
    this.state.groupedVertices = this.state.buildings.map(
      function (building) { return building.coordinates.map(
        function (polygon) { return polygon.map(
          function (coordinate) { return [
            coordinate[0],
            coordinate[1],
            building.properties.height || 10
          ]; }
        ); }
      ); }
    );
    var ref$1;
  };

  ExtrudedChoroplethLayer64.prototype.calculateContourIndices = function calculateContourIndices (vertices, offset) {
    var stride = countVertices(vertices);

    return vertices.map(function (polygon) {
      var indices = [offset];
      var numVertices = polygon.length;

      // building top
      // use vertex pairs for GL.LINES => [0, 1, 1, 2, 2, ..., n-1, n-1, 0]
      for (var i = 1; i < numVertices - 1; i++) {
        indices.push(i + offset, i + offset);
      }
      indices.push(offset);

      // building sides
      for (var i$1 = 0; i$1 < numVertices - 1; i$1++) {
        indices.push(i$1 + offset, i$1 + stride + offset);
      }

      offset += numVertices;
      return indices;
    });
  };

  ExtrudedChoroplethLayer64.prototype.calculateSurfaceIndices = function calculateSurfaceIndices (vertices, offset) {
    var stride = countVertices(vertices);
    var holes = null;
    var quad = [
      [0, 1], [0, 3], [1, 2],
      [1, 2], [0, 3], [1, 4]
    ];

    if (vertices.length > 1) {
      holes = vertices.reduce(
        function (acc, polygon) { return acc.concat( [acc[acc.length - 1] + polygon.length]); },
        [0]
      ).slice(1, vertices.length);
    }

    var topIndices = earcut(flattenDeep(vertices), holes, 3)
      .map(function (index) { return index + offset; });

    var sideIndices = vertices.map(function (polygon) {
      var numVertices = polygon.length;
      // building top
      var indices = [];

      // building sides
      for (var i = 0; i < numVertices - 1; i++) {
        indices.push.apply(indices, drawRectangle(i));
      }

      offset += numVertices;
      return indices;
    });

    return [topIndices, sideIndices];

    function drawRectangle(i) {
      return quad.map(function (v) { return i + v[0] + stride * v[1] + offset; });
    }
  };

  return ExtrudedChoroplethLayer64;
}(Layer));

export default ExtrudedChoroplethLayer64;

ExtrudedChoroplethLayer64.layerName = 'ExtrudedChoroplethLayer64';

/*
 * helpers
 */
// get normal vector of line segment
function getNormal(p1, p2) {
  if (p1[0] === p2[0] && p1[1] === p2[1]) {
    return [1, 0, 0];
  }

  var degrees2radians = Math.PI / 180;

  var lon1 = degrees2radians * p1[0];
  var lon2 = degrees2radians * p2[0];
  var lat1 = degrees2radians * p1[1];
  var lat2 = degrees2radians * p2[1];

  var a = Math.sin(lon2 - lon1) * Math.cos(lat2);
  var b = Math.cos(lat1) * Math.sin(lat2) -
     Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  return vec3.normalize([], [b, 0, -a]);
}

// count number of vertices in geojson polygon
function countVertices(vertices) {
  return vertices.reduce(function (count, polygon) { return count + polygon.length; }, 0);
}
