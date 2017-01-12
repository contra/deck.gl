
// IMLEMENTATION NOTES: Why new layers are created on every render
//
// The key here is to understand the declarative / functional
// programming nature of "reactive" applications.
//
// - In a reactive application, the entire "UI tree"
//   is re-rendered every time something in the application changes.
//
// - The UI framework (such as React or deck.gl) then diffs the rendered
//   tree of UI elements (React Elements or deck.gl Layers) against the
//   previously tree and makes optimized changes (to the DOM or to WebGL state).
//
// - Deck.gl layers are not based on React.
//   But it should be possible to wrap deck.gl layers in React components to
//   enable use of JSX.
//
// The deck.gl model that for the app creates a new set of on layers on every
// render.
// Internally, the new layers are efficiently matched against existing layers
// using layer ids.
//
// All calculated state (programs, attributes etc) are stored in a state object
// and this state object is moved forward to the match layer on every render
// cycle.  The new layer ends up with the state of the old layer (and the
// props of the new layer), while the old layer is simply discarded for
// garbage collecion.
//
/* eslint-disable no-try-catch */
import Layer from './layer';
import {log} from './utils';
import assert from 'assert';
import {drawLayers, pickLayers} from './draw-and-pick';
// import {Viewport} from 'viewport-mercator-project';
import {Viewport} from './viewports';

import {FramebufferObject} from 'luma.gl';

var LayerManager = function LayerManager(ref) {
  var gl = ref.gl;

  this.prevLayers = [];
  this.layers = [];
  // Tracks if any layers were drawn last update
  // Needed to ensure that screen is cleared when no layers are shown
  this.drewLayers = false;
  this.oldContext = {};
  this.context = {
    gl: gl,
    uniforms: {},
    viewport: null,
    viewportChanged: true,
    pickingFBO: null
  };
  this.redrawNeeded = true;
  Object.seal(this.context);
};

LayerManager.prototype.setViewport = function setViewport (viewport) {
  assert(viewport instanceof Viewport, 'Invalid viewport');

  // TODO - viewport change detection breaks METER_OFFSETS mode
  // const oldViewport = this.context.viewport;
  // const viewportChanged = !oldViewport || !viewport.equals(oldViewport);

  var viewportChanged = true;

  if (viewportChanged) {
    Object.assign(this.oldContext, this.context);
    this.context.viewport = viewport;
    this.context.viewportChanged = true;
    this.context.uniforms = {};
    log(4, viewport);
  }

  return this;
};

LayerManager.prototype.updateLayers = function updateLayers (ref) {
    var this$1 = this;
    var newLayers = ref.newLayers;

  /* eslint-disable */
  assert(this.context.viewport,
    'LayerManager.updateLayers: viewport not set');

  // Filter out any null layers
  newLayers = newLayers.filter(function (newLayer) { return newLayer !== null; });

  for (var i = 0, list = newLayers; i < list.length; i += 1) {
    var layer = list[i];

      layer.context = this$1.context;
  }

  this.prevLayers = this.layers;
  var ref$1 = this._updateLayers({
    oldLayers: this.prevLayers,
    newLayers: newLayers
  });
    var error = ref$1.error;
    var generatedLayers = ref$1.generatedLayers;

  this.layers = generatedLayers;
  // Throw first error found, if any
  if (error) {
    throw error;
  }
  return this;
};

LayerManager.prototype.drawLayers = function drawLayers$1 () {
  assert(this.context.viewport, 'LayerManager.drawLayers: viewport not set');

  drawLayers({layers: this.layers});

  return this;
};

LayerManager.prototype.pickLayer = function pickLayer (ref) {
    var x = ref.x;
    var y = ref.y;
    var mode = ref.mode;

  var ref$1 = this.context;
    var gl = ref$1.gl;
    var uniforms = ref$1.uniforms;

  // Set up a frame buffer if needed
  if (this.context.pickingFBO === null ||
    gl.canvas.width !== this.context.pickingFBO.width ||
    gl.canvas.height !== this.context.pickingFBO.height) {
    this.context.pickingFBO = new FramebufferObject(gl, {
      width: gl.canvas.width,
      height: gl.canvas.height
    });
  }
  return pickLayers(gl, {
    x: x,
    y: y,
    uniforms: {
      renderPickingBuffer: true,
      picking_uEnable: true
    },
    layers: this.layers,
    mode: mode,
    pickingFBO: this.context.pickingFBO
  });
};

LayerManager.prototype.needsRedraw = function needsRedraw (ref) {
    var this$1 = this;
    if ( ref === void 0 ) ref = {};
    var clearRedrawFlags = ref.clearRedrawFlags; if ( clearRedrawFlags === void 0 ) clearRedrawFlags = false;

  if (!this.context.viewport) {
    return false;
  }

  var redraw = false;

  // Make sure that buffer is cleared once when layer list becomes empty
  if (this.layers.length === 0 && this.drewLayers) {
    redraw = true;
    return true;
  }

  if (this.redrawNeeded) {
    this.redrawNeeded = false;
    redraw = true;
  }

  for (var i = 0, list = this$1.layers; i < list.length; i += 1) {
    var layer = list[i];

      redraw = redraw || layer.getNeedsRedraw({clearRedrawFlags: clearRedrawFlags});
    this$1.drewLayers = true;
  }
  return redraw;
};

// PRIVATE METHODS

// Match all layers, checking for caught errors
// To avoid having an exception in one layer disrupt other layers
LayerManager.prototype._updateLayers = function _updateLayers (ref) {
    var oldLayers = ref.oldLayers;
    var newLayers = ref.newLayers;

  // Create old layer map
  var oldLayerMap = {};
  for (var i = 0, list = oldLayers; i < list.length; i += 1) {
    var oldLayer = list[i];

      if (oldLayerMap[oldLayer.id]) {
      log.once(0, ("Multipe old layers with same id " + (layerName(oldLayer))));
    } else {
      oldLayerMap[oldLayer.id] = oldLayer;
    }
  }

  // Allocate array for generated layers
  var generatedLayers = [];

  // Match sublayers
  var error = this._matchSublayers({
    newLayers: newLayers, oldLayerMap: oldLayerMap, generatedLayers: generatedLayers
  });

  var error2 = this._finalizeOldLayers(oldLayers);
  var firstError = error || error2;
  return {error: firstError, generatedLayers: generatedLayers};
};

/* eslint-disable max-statements */
LayerManager.prototype._matchSublayers = function _matchSublayers (ref) {
    var this$1 = this;
    var newLayers = ref.newLayers;
    var oldLayerMap = ref.oldLayerMap;
    var generatedLayers = ref.generatedLayers;

  // Filter out any null layers
  newLayers = newLayers.filter(function (newLayer) { return newLayer !== null; });

  var error = null;
  for (var i = 0, list = newLayers; i < list.length; i += 1) {
    var newLayer = list[i];

      newLayer.context = this$1.context;

    try {
      // 1. given a new coming layer, find its matching layer
      var oldLayer = oldLayerMap[newLayer.id];
      oldLayerMap[newLayer.id] = null;

      if (oldLayer === null) {
        log.once(0, ("Multipe new layers with same id " + (layerName(newLayer))));
      }


      // Only transfer state at this stage. We must not generate exceptions
      // until all layers' state have been transferred
      if (oldLayer) {
        log(3, ("matched " + (layerName(newLayer))), oldLayer, '=>', newLayer);
        this$1._transferLayerState(oldLayer, newLayer);
        this$1._updateLayer(newLayer);
      } else {
        this$1._initializeNewLayer(newLayer);
      }
      generatedLayers.push(newLayer);

      // Call layer lifecycle method: render sublayers
      var sublayers = newLayer.renderLayers();
      // End layer lifecycle method: render sublayers

      if (sublayers) {
        sublayers = Array.isArray(sublayers) ? sublayers : [sublayers];
        this$1._matchSublayers({
          newLayers: sublayers,
          oldLayerMap: oldLayerMap,
          generatedLayers: generatedLayers
        });
      }
    } catch (err) {
      log.once(0,
        ("deck.gl error during matching of " + (layerName(newLayer)) + " " + err), err);
      // Save first error
      error = error || err;
    }
  }
  return error;
};

LayerManager.prototype._transferLayerState = function _transferLayerState (oldLayer, newLayer) {
  var state = oldLayer.state;
    var props = oldLayer.props;

  // sanity check
  assert(state, 'deck.gl sanity check - Matching layer has no state');
  assert(oldLayer !== newLayer, 'deck.gl sanity check - Matching layer is same');

  // Move state
  newLayer.state = state;
  state.layer = newLayer;

  // Update model layer reference
  if (state.model) {
    state.model.userData.layer = newLayer;
  }
  // Keep a temporary ref to the old props, for prop comparison
  newLayer.oldProps = props;
  oldLayer.state = null;
};

// Update the old layers that were not matched
LayerManager.prototype._finalizeOldLayers = function _finalizeOldLayers (oldLayers) {
    var this$1 = this;

  var error = null;
  // Unmatched layers still have state, it will be discarded
  for (var i = 0, list = oldLayers; i < list.length; i += 1) {
    var layer = list[i];

      if (layer.state) {
      error = error || this$1._finalizeLayer(layer);
    }
  }
  return error;
};

// Initializes a single layer, calling layer methods
LayerManager.prototype._initializeNewLayer = function _initializeNewLayer (layer) {
  var error = null;
  // Check if new layer, and initialize it's state
  if (!layer.state) {
    log(1, ("initializing " + (layerName(layer))));
    try {
      layer.initializeLayer({
        oldProps: {},
        props: layer.props,
        oldContext: this.oldContext,
        context: this.context,
        changeFlags: layer.diffProps({}, layer.props, this.context)
      });
    } catch (err) {
      log.once(0, ("deck.gl error during initialization of " + (layerName(layer)) + " " + err), err);
      // Save first error
      error = error || err;
    }
    // Set back pointer (used in picking)
    if (layer.state) {
      layer.state.layer = layer;
      // Save layer on model for picking purposes
      // TODO - store on model.userData rather than directly on model
    }
    if (layer.state && layer.state.model) {
      layer.state.model.userData.layer = layer;
    }
  }
  return error;
};

// Updates a single layer, calling layer methods
LayerManager.prototype._updateLayer = function _updateLayer (layer) {
  var oldProps = layer.oldProps;
    var props = layer.props;
  var error = null;
  if (oldProps) {
    try {
      layer.updateLayer({
        oldProps: oldProps,
        props: props,
        context: this.context,
        oldContext: this.oldContext,
        changeFlags: layer.diffProps(oldProps, layer.props, this.context)
      });
    } catch (err) {
      log.once(0, ("deck.gl error during update of " + (layerName(layer))), err);
      // Save first error
      error = err;
    }
    log(2, ("updating " + (layerName(layer))));
  }
  return error;
};

// Finalizes a single layer
LayerManager.prototype._finalizeLayer = function _finalizeLayer (layer) {
  var error = null;
  var state = layer.state;
  if (state) {
    try {
      layer.finalizeLayer();
    } catch (err) {
      log.once(0,
        ("deck.gl error during finalization of " + (layerName(layer))), err);
      // Save first error
      error = err;
    }
    layer.state = null;
    log(1, ("finalizing " + (layerName(layer))));
  }
  return error;
};

export default LayerManager;

function layerName(layer) {
  if (layer instanceof Layer) {
    return ("" + layer);
  }
  return !layer ? 'null layer' : 'invalid layer';
}
