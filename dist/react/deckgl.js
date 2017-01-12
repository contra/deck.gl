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
import React, {PropTypes, createElement} from 'react';
import autobind from './autobind';
import WebGLRenderer from './webgl-renderer';
import {LayerManager, Layer} from '../lib';
import {EffectManager, Effect} from '../experimental';
import {GL, addEvents} from 'luma.gl';
// import {Viewport, WebMercatorViewport} from 'viewport-mercator-project';
import {Viewport, WebMercatorViewport} from '../lib/viewports';
import {log} from '../lib/utils';

function noop() {}

var propTypes = {
  id: PropTypes.string,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  layers: PropTypes.arrayOf(PropTypes.instanceOf(Layer)).isRequired,
  effects: PropTypes.arrayOf(PropTypes.instanceOf(Effect)),
  gl: PropTypes.object,
  debug: PropTypes.bool,
  viewport: PropTypes.instanceOf(Viewport),
  onWebGLInitialized: PropTypes.func,
  onLayerClick: PropTypes.func,
  onLayerHover: PropTypes.func
};

var defaultProps = {
  id: 'deckgl-overlay',
  debug: false,
  gl: null,
  effects: [],
  onWebGLInitialized: noop,
  onLayerClick: noop,
  onLayerHover: noop
};

var DeckGL = (function (superclass) {
  function DeckGL(props) {
    superclass.call(this, props);
    this.state = {};
    this.needsRedraw = true;
    this.layerManager = null;
    this.effectManager = null;
    autobind(this);
  }

  if ( superclass ) DeckGL.__proto__ = superclass;
  DeckGL.prototype = Object.create( superclass && superclass.prototype );
  DeckGL.prototype.constructor = DeckGL;

  DeckGL.prototype.componentWillReceiveProps = function componentWillReceiveProps (nextProps) {
    this._updateLayers(nextProps);
  };

  DeckGL.prototype._updateLayers = function _updateLayers (nextProps) {
    var width = nextProps.width;
    var height = nextProps.height;
    var latitude = nextProps.latitude;
    var longitude = nextProps.longitude;
    var zoom = nextProps.zoom;
    var pitch = nextProps.pitch;
    var bearing = nextProps.bearing;
    var altitude = nextProps.altitude;
    var viewport = nextProps.viewport;

    // If Viewport is not supplied, create one from mercator props
    viewport = viewport || new WebMercatorViewport({
      width: width, height: height, latitude: latitude, longitude: longitude, zoom: zoom, pitch: pitch, bearing: bearing, altitude: altitude
    });

    if (this.layerManager) {
      this.layerManager
        .setViewport(viewport)
        .updateLayers({newLayers: nextProps.layers});
    }
  };

  DeckGL.prototype._onRendererInitialized = function _onRendererInitialized (ref) {
    var this$1 = this;
    var gl = ref.gl;
    var canvas = ref.canvas;

    gl.enable(GL.BLEND);
    gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

    this.props.onWebGLInitialized(gl);

    // Note: avoid React setState due GL animation loop / setState timing issue
    this.layerManager = new LayerManager({gl: gl});
    this.effectManager = new EffectManager({gl: gl, layerManager: this.layerManager});
    for (var i = 0, list = this$1.props.effects; i < list.length; i += 1) {
      var effect = list[i];

      this$1.effectManager.addEffect(effect);
    }
    this._updateLayers(this.props);

    // Check if a mouse event has been specified and that at least one of the layers is pickable
    var hasEvent = this.props.onLayerClick !== noop || this.props.onLayerHover !== noop;
    var hasPickableLayer = this.layerManager.layers.map(function (l) { return l.props.pickable; }).includes(true);
    if (hasEvent && !hasPickableLayer) {
      log.once(
        0,
        'You have supplied a mouse event handler but none of your layers got the `pickable` flag.'
      );
    }

    this.events = addEvents(canvas, {
      cacheSize: false,
      cachePosition: false,
      centerOrigin: false,
      onClick: this._onClick,
      onMouseMove: this._onMouseMove
    });
  };

  // Route events to layers
  DeckGL.prototype._onClick = function _onClick (event) {
    var x = event.x;
    var y = event.y;
    var selectedInfos = this.layerManager.pickLayer({x: x, y: y, mode: 'click'});
    var firstInfo = selectedInfos.find(function (info) { return info.index >= 0; });
    // Event.event holds the original MouseEvent object
    this.props.onLayerClick(firstInfo, selectedInfos, event.event);
  };

  // Route events to layers
  DeckGL.prototype._onMouseMove = function _onMouseMove (event) {
    var x = event.x;
    var y = event.y;
    var selectedInfos = this.layerManager.pickLayer({x: x, y: y, mode: 'hover'});
    var firstInfo = selectedInfos.find(function (info) { return info.index >= 0; });
    // Event.event holds the original MouseEvent object
    this.props.onLayerHover(firstInfo, selectedInfos, event.event);
  };

  DeckGL.prototype._onRenderFrame = function _onRenderFrame (ref) {
    var gl = ref.gl;

    if (!this.layerManager.needsRedraw({clearRedrawFlags: true})) {
      return;
    }
    // clear depth and color buffers
    gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

    this.effectManager.preDraw();

    this.layerManager.drawLayers();

    this.effectManager.draw();
  };

  DeckGL.prototype.render = function render () {
    var ref = this.props;
    var width = ref.width;
    var height = ref.height;
    var gl = ref.gl;
    var debug = ref.debug;

    return createElement(WebGLRenderer, Object.assign({}, this.props, {
      width: width,
      height: height,
      gl: gl,
      debug: debug,
      viewport: {x: 0, y: 0, width: width, height: height},
      onRendererInitialized: this._onRendererInitialized,
      onNeedRedraw: this._onNeedRedraw,
      onRenderFrame: this._onRenderFrame,
      onMouseMove: this._onMouseMove,
      onClick: this._onClick
    }));
  };

  return DeckGL;
}(React.Component));

export default DeckGL;

DeckGL.propTypes = propTypes;
DeckGL.defaultProps = defaultProps;
