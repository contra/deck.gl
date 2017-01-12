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
import {GL} from 'luma.gl';
import AttributeManager from './attribute-manager';
import {compareProps, log} from './utils';
import assert from 'assert';

/*
 * @param {string} props.id - layer name
 * @param {array}  props.data - array of data instances
 * @param {bool} props.opacity - opacity of the layer
 */
var defaultProps = {
  data: [],
  dataIterator: null,
  dataComparator: null,
  numInstances: undefined,
  visible: true,
  pickable: false,
  opacity: 0.8,
  onHover: function () {},
  onClick: function () {},
  getValue: function (x) { return x; },
  // Update triggers: a key change detection mechanism in deck.gl
  // See layer documentation
  updateTriggers: {}
};

var counter = 0;

var Layer = function Layer(props) {
  props = Object.assign({}, defaultProps, props, {
    // Accept null as data - otherwise apps will need to add ugly checks
    data: props.data || [],
    id: props.id || this.constructor.layerName
  });

  this.id = props.id;
  this.count = counter++;
  this.props = props;
  this.oldProps = null;
  this.state = null;
  this.context = null;
  Object.seal(this);

  this.validateRequiredProp('id', function (x) { return typeof x === 'string'; });
  this.validateRequiredProp('data');
  // TODO - allow app to supply dataIterator prop?
  // if (props.data) {
  // addIterator(props.data);
  // if (!props.data[Symbol.iterator]) {
  //   log.once(0, 'data prop must have iterator');
  // }
  // }

  this._validateDeprecatedProps();
};

Layer.prototype.toString = function toString () {
  var className = this.constructor.name;
  return (className !== this.props.id) ?
    ("<" + className + ":'" + (this.props.id) + "'>") : ("<" + className + ">");
};

// //////////////////////////////////////////////////
// LIFECYCLE METHODS, overridden by the layer subclasses

// Called once to set up the initial state
// App can create WebGL resources
Layer.prototype.initializeState = function initializeState () {
  throw new Error(("Layer " + (this) + " has not defined initializeState"));
};

// Called once when layer is no longer matched and state will be discarded
// App can destroy WebGL resources
Layer.prototype.finalizeState = function finalizeState () {
};

Layer.prototype.shouldUpdateState = function shouldUpdateState (ref) {
    var oldProps = ref.oldProps;
    var props = ref.props;
    var oldContext = ref.oldContext;
    var context = ref.context;
    var changeFlags = ref.changeFlags;

  return changeFlags.somethingChanged;
};

// Default implementation, all attributeManager will be updated
Layer.prototype.updateState = function updateState (ref) {
    var oldProps = ref.oldProps;
    var props = ref.props;
    var oldContext = ref.oldContext;
    var context = ref.context;
    var changeFlags = ref.changeFlags;

  if (changeFlags.dataChanged && this.state.attributeManager) {
    this.state.attributeManager.invalidateAll();
  }
};

// Implement to generate sublayers
Layer.prototype.renderLayers = function renderLayers () {
  return null;
};

// If state has a model, draw it with supplied uniforms
Layer.prototype.draw = function draw (ref) {
    var uniforms = ref.uniforms; if ( uniforms === void 0 ) uniforms = {};

  if (this.state.model) {
    this.state.model.render(uniforms);
  }
};

// If state has a model, draw it with supplied uniforms
/* eslint-disable max-statements */
Layer.prototype.pick = function pick (ref) {
    var info = ref.info;
    var uniforms = ref.uniforms;
    var pickEnableUniforms = ref.pickEnableUniforms;
    var pickDisableUniforms = ref.pickDisableUniforms;
    var mode = ref.mode;

  var ref$1 = this.context;
    var gl = ref$1.gl;
  var ref$2 = this.state;
    var model = ref$2.model;

  if (model) {
    model.setUniforms(pickEnableUniforms);
    model.render(uniforms);
    model.setUniforms(pickDisableUniforms);

    // Read color in the central pixel, to be mapped with picking colors
    var ref$3 = info.devicePixel;
      var x = ref$3[0];
      var y = ref$3[1];
    var color = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, GL.RGBA, GL.UNSIGNED_BYTE, color);

    // Index < 0 means nothing selected
    info.index = this.decodePickingColor(color);
    info.color = color;

    // TODO - selectedPickingColor should be removed?
    if (mode === 'hover') {
      var selectedPickingColor = new Float32Array(3);
      selectedPickingColor[0] = color[0];
      selectedPickingColor[1] = color[1];
      selectedPickingColor[2] = color[2];
      this.setUniforms({selectedPickingColor: selectedPickingColor});
    }
  }
};
/* eslint-enable max-statements */

// END LIFECYCLE METHODS
// //////////////////////////////////////////////////

// Public API

// Updates selected state members and marks the object for redraw
Layer.prototype.setState = function setState (updateObject) {
  Object.assign(this.state, updateObject);
  this.state.needsRedraw = true;
};

Layer.prototype.setNeedsRedraw = function setNeedsRedraw (redraw) {
    if ( redraw === void 0 ) redraw = true;

  if (this.state) {
    this.state.needsRedraw = redraw;
  }
};

// PROJECTION METHODS

/**
 * Projects a point with current map state (lat, lon, zoom, pitch, bearing)
 *
 * Note: Position conversion is done in shader, so in many cases there is no need
 * for this function
 * @param {Array|TypedArray} lngLat - long and lat values
 * @return {Array|TypedArray} - x, y coordinates
 */
Layer.prototype.project = function project (lngLat) {
  var ref = this.context;
    var viewport = ref.viewport;
  assert(Array.isArray(lngLat), 'Layer.project needs [lng,lat]');
  return viewport.project(lngLat);
};

Layer.prototype.unproject = function unproject (xy) {
  var ref = this.context;
    var viewport = ref.viewport;
  assert(Array.isArray(xy), 'Layer.unproject needs [x,y]');
  return viewport.unproject(xy);
};

Layer.prototype.projectFlat = function projectFlat (lngLat) {
  var ref = this.context;
    var viewport = ref.viewport;
  assert(Array.isArray(lngLat), 'Layer.project needs [lng,lat]');
  return viewport.projectFlat(lngLat);
};

Layer.prototype.unprojectFlat = function unprojectFlat (xy) {
  var ref = this.context;
    var viewport = ref.viewport;
  assert(Array.isArray(xy), 'Layer.unproject needs [x,y]');
  return viewport.unprojectFlat(xy);
};

Layer.prototype.screenToDevicePixels = function screenToDevicePixels (screenPixels) {
  var devicePixelRatio = typeof window !== 'undefined' ?
    window.devicePixelRatio : 1;
  return screenPixels * devicePixelRatio;
};

/**
 * Returns the picking color that doesn't match any subfeature
 * Use if some graphics do not belong to any pickable subfeature
 * @return {Array} - a black color
 */
Layer.prototype.nullPickingColor = function nullPickingColor () {
  return [0, 0, 0];
};

/**
 * Returns the picking color that doesn't match any subfeature
 * Use if some graphics do not belong to any pickable subfeature
 * @param {int} i - index to be decoded
 * @return {Array} - the decoded color
 */
Layer.prototype.encodePickingColor = function encodePickingColor (i) {
  return [
    (i + 1) % 256,
    Math.floor((i + 1) / 256) % 256,
    Math.floor((i + 1) / 256 / 256) % 256
  ];
};

/**
 * Returns the picking color that doesn't match any subfeature
 * Use if some graphics do not belong to any pickable subfeature
 * @param {Uint8Array} color - color array to be decoded
 * @return {Array} - the decoded picking color
 */
Layer.prototype.decodePickingColor = function decodePickingColor (color) {
  assert(color instanceof Uint8Array);
  var i1 = color[0];
    var i2 = color[1];
    var i3 = color[2];
  // 1 was added to seperate from no selection
  var index = i1 + i2 * 256 + i3 * 65536 - 1;
  return index;
};

Layer.prototype.calculateInstancePickingColors = function calculateInstancePickingColors (attribute, ref) {
    var this$1 = this;
    var numInstances = ref.numInstances;

  var value = attribute.value;
    var size = attribute.size;
  // add 1 to index to seperate from no selection
  for (var i = 0; i < numInstances; i++) {
    var pickingColor = this$1.encodePickingColor(i);
    value[i * size + 0] = pickingColor[0];
    value[i * size + 1] = pickingColor[1];
    value[i * size + 2] = pickingColor[2];
  }
};

// DATA ACCESS API
// Data can use iterators and may not be random access

// Use iteration (the only required capability on data) to get first element
Layer.prototype.getFirstObject = function getFirstObject () {
  var ref = this.props;
    var data = ref.data;
  for (var i = 0, list = data; i < list.length; i += 1) {
    var object = list[i];

      return object;
  }
  return null;
};

// INTERNAL METHODS

// Deduces numer of instances. Intention is to support:
// - Explicit setting of numInstances
// - Auto-deduction for ES6 containers that define a size member
// - Auto-deduction for Classic Arrays via the built-in length attribute
// - Auto-deduction via arrays
Layer.prototype.getNumInstances = function getNumInstances (props) {
  props = props || this.props;

  // First check if the layer has set its own value
  if (this.state && this.state.numInstances !== undefined) {
    return this.state.numInstances;
  }

  // Check if app has provided an explicit value
  if (props.numInstances !== undefined) {
    return props.numInstances;
  }

  var data = props.data;

  // Check if ES6 collection "count" function is available
  if (data && typeof data.count === 'function') {
    return data.count();
  }

  // Check if ES6 collection "size" attribute is set
  if (data && data.size !== undefined) {
    return data.size;
  }

  // Check if array length attribute is set
  // Note: checking this last since some ES6 collections (Immutable.js)
  // emit profuse warnings when trying to access `length` attribute
  if (data && data.length !== undefined) {
    return data.length;
  }

  throw new Error('Could not deduce numInstances');
};

// LAYER MANAGER API
// Should only be called by the deck.gl LayerManager class

// Called by layer manager when a new layer is found
/* eslint-disable max-statements */
Layer.prototype.initializeLayer = function initializeLayer (updateParams) {
  assert(this.context.gl, 'Layer context missing gl');
  assert(!this.state, 'Layer missing state');

  this.state = {};

  // Initialize state only once
  this.setState({
    attributeManager: new AttributeManager({id: this.props.id}),
    model: null,
    needsRedraw: true,
    dataChanged: true
  });

  // Add attribute manager loggers if provided
  this.state.attributeManager.setLogFunctions(this.props);

  var ref = this.state;
    var attributeManager = ref.attributeManager;
  // All instanced layers get instancePickingColors attribute by default
  // Their shaders can use it to render a picking scene
  // TODO - this slows down non instanced layers
  attributeManager.addInstanced({
    instancePickingColors: {
      type: GL.UNSIGNED_BYTE,
      size: 3,
      update: this.calculateInstancePickingColors
    }
  });

  // Call subclass lifecycle methods
  this.initializeState();
  this.updateState(updateParams);
  // End subclass lifecycle methods

  // Add any subclass attributes
  this._updateAttributes(this.props);
  this._updateBaseUniforms();

  var ref$1 = this.state;
    var model = ref$1.model;
  if (model) {
    model.setInstanceCount(this.getNumInstances());
    model.id = this.props.id;
    model.program.id = (this.props.id) + "-program";
    model.geometry.id = (this.props.id) + "-geometry";
    model.setAttributes(attributeManager.getAttributes());
  }
};

// Called by layer manager when existing layer is getting new props
Layer.prototype.updateLayer = function updateLayer (updateParams) {
  // Check for deprecated method
  if (this.shouldUpdate) {
    log.once(0,
      ("deck.gl v3 shouldUpdate deprecated. Use shouldUpdateState in " + (this)));
  }

  // Call subclass lifecycle method
  var stateNeedsUpdate = this.shouldUpdateState(updateParams);
  // End lifecycle method

  if (stateNeedsUpdate) {

    // Call deprecated lifecycle method if defined
    var hasRedefinedMethod = this.willReceiveProps &&
      this.willReceiveProps !== Layer.prototype.willReceiveProps;
    if (hasRedefinedMethod) {
      log.once(0,
        ("deck.gl v3 willReceiveProps deprecated. Use updateState in " + (this)));
      var oldProps = updateParams.oldProps;
        var props = updateParams.props;
        var changeFlags = updateParams.changeFlags;
      this.setState(changeFlags);
      this.willReceiveProps(oldProps, props, changeFlags);
      this.setState({
        dataChanged: false,
        viewportChanged: false
      });
    }
    // End lifecycle method

    // Call subclass lifecycle method
    this.updateState(updateParams);
    // End lifecycle method

    // Run the attribute updaters
    this._updateAttributes(updateParams.newProps);
    this._updateBaseUniforms();

    if (this.state.model) {
      this.state.model.setInstanceCount(this.getNumInstances());
    }
  }
};
/* eslint-enable max-statements */

// Called by manager when layer is about to be disposed
// Note: not guaranteed to be called on application shutdown
Layer.prototype.finalizeLayer = function finalizeLayer () {
  // Call subclass lifecycle method
  this.finalizeState();
  // End lifecycle method
};

// Calculates uniforms
Layer.prototype.drawLayer = function drawLayer (ref) {
    var uniforms = ref.uniforms; if ( uniforms === void 0 ) uniforms = {};

  // Call subclass lifecycle method
  this.draw({uniforms: uniforms});
  // End lifecycle method
};

// {uniforms = {}, ...opts}
Layer.prototype.pickLayer = function pickLayer (opts) {
  // Call subclass lifecycle method
  return this.pick(opts);
  // End lifecycle method
};

Layer.prototype.diffProps = function diffProps (oldProps, newProps, context) {
  // If any props have changed, ignoring updateTriggers objects
  // (updateTriggers are expected to be a new object on every update)
  var propsChangedReason = compareProps({
    newProps: newProps,
    oldProps: oldProps,
    ignoreProps: {data: null, updateTriggers: null}
  });

  var dataChangedReason = this._diffDataProps(oldProps, newProps);

  var propsChanged = Boolean(propsChangedReason);
  var dataChanged = Boolean(dataChangedReason);
  var viewportChanged = context.viewportChanged;
  var somethingChanged =
    propsChanged || dataChanged || viewportChanged;

  // If data hasn't changed, check update triggers
  if (!dataChanged) {
    this._diffUpdateTriggers(oldProps, newProps);
  } else {
    log.log(1, ("dataChanged: " + dataChanged));
  }

  return {
    propsChanged: propsChanged,
    dataChanged: dataChanged,
    viewportChanged: viewportChanged,
    somethingChanged: somethingChanged,
    reason: dataChangedReason || propsChangedReason
  };
};

// Checks state of attributes and model
// TODO - is attribute manager needed? - Model should be enough.
Layer.prototype.getNeedsRedraw = function getNeedsRedraw (ref) {
    if ( ref === void 0 ) ref = {};
    var clearRedrawFlags = ref.clearRedrawFlags; if ( clearRedrawFlags === void 0 ) clearRedrawFlags = false;

  // this method may be called by the render loop as soon a the layer
  // has been created, so guard against uninitialized state
  if (!this.state) {
    return false;
  }

  var redraw = false;
  redraw = redraw || this.state.needsRedraw;
  this.state.needsRedraw = this.state.needsRedraw && !clearRedrawFlags;

  var ref$1 = this.state;
    var attributeManager = ref$1.attributeManager;
    var model = ref$1.model;
  redraw = redraw ||
    (attributeManager && attributeManager.getNeedsRedraw({clearRedrawFlags: clearRedrawFlags}));
  redraw = redraw ||
    (model && model.getNeedsRedraw({clearRedrawFlags: clearRedrawFlags}));

  return redraw;
};

// PRIVATE METHODS

// The comparison of the data prop requires special handling
// the dataComparator should be used if supplied
Layer.prototype._diffDataProps = function _diffDataProps (oldProps, newProps) {
  // Support optional app defined comparison of data
  var dataComparator = newProps.dataComparator;
  if (dataComparator) {
    if (!dataComparator(newProps.data, oldProps.data)) {
      return 'Data comparator detected a change';
    }
  // Otherwise, do a shallow equal on props
  } else if (newProps.data !== oldProps.data) {
    return 'A new data container was supplied';
  }

  return null;
};

// Checks if any update triggers have changed, and invalidate
// attributes accordingly.
/* eslint-disable max-statements */
Layer.prototype._diffUpdateTriggers = function _diffUpdateTriggers (oldProps, newProps) {
  var ref = this.state;
    var attributeManager = ref.attributeManager;
  if (!attributeManager) {
    return false;
  }

  var change = false;

  for (var propName in newProps.updateTriggers) {
    var oldTriggers = oldProps.updateTriggers[propName];
    var newTriggers = newProps.updateTriggers[propName];
    var diffReason = compareProps({
      oldProps: oldTriggers,
      newProps: newTriggers
    });
    if (diffReason) {
      if (propName === 'all') {
        log.log(1,
          ("updateTriggers invalidating all attributes: " + diffReason));
        attributeManager.invalidateAll();
        change = true;
      } else {
        log.log(1,
          ("updateTriggers invalidating attribute " + propName + ": " + diffReason));
        attributeManager.invalidate(propName);
        change = true;
      }
    }
  }

  return change;
};
/* eslint-enable max-statements */

Layer.prototype.validateRequiredProp = function validateRequiredProp (propertyName, condition) {
  var value = this.props[propertyName];
  if (value === undefined) {
    throw new Error(("Property " + propertyName + " undefined in layer " + (this)));
  }
  if (condition && !condition(value)) {
    throw new Error(("Bad property " + propertyName + " in layer " + (this)));
  }
};

// Calls attribute manager to update any WebGL attributes
Layer.prototype._updateAttributes = function _updateAttributes (props) {
  var ref = this.state;
    var attributeManager = ref.attributeManager;
    var model = ref.model;
  if (!attributeManager) {
    return;
  }

  var numInstances = this.getNumInstances(props);
  // Figure out data length
  attributeManager.update({
    numInstances: numInstances,
    bufferMap: props,
    context: this,
    // Don't worry about non-attribute props
    ignoreUnknownAttributes: true
  });
  if (model) {
    var changedAttributes =
      attributeManager.getChangedAttributes({clearChangedFlags: true});
    model.setAttributes(changedAttributes);
  }
};

Layer.prototype._updateBaseUniforms = function _updateBaseUniforms () {
  this.setUniforms({
    // apply gamma to opacity to make it visually "linear"
    opacity: Math.pow(this.props.opacity, 1 / 2.2),
    ONE: 1.0
  });
};

// DEPRECATED METHODS
// shouldUpdate() {}

Layer.prototype.willReceiveProps = function willReceiveProps () {
};

// Updates selected state members and marks the object for redraw
Layer.prototype.setUniforms = function setUniforms (uniformMap) {
  if (this.state.model) {
    this.state.model.setUniforms(uniformMap);
  }
  // TODO - set needsRedraw on the model?
  this.state.needsRedraw = true;
  log(3, 'layer.setUniforms', uniformMap);
};

Layer.prototype._validateDeprecatedProps = function _validateDeprecatedProps () {
  if (this.props.isPickable !== undefined) {
    log.once(0, 'No isPickable prop in deckgl v3 - use pickable instead');
  }

  // TODO - inject viewport from overlay instead of creating for each layer?
  var hasViewportProps =
    // this.props.width !== undefined ||
    // this.props.height !== undefined ||
    this.props.latitude !== undefined ||
    this.props.longitude !== undefined ||
    this.props.zoom !== undefined ||
    this.props.pitch !== undefined ||
    this.props.bearing !== undefined;
  if (hasViewportProps) {
    /* eslint-disable no-console */
    // /* global console */
    log.once(0,
      ("deck.gl v3 no longer needs viewport props in Layer " + (this)));
  }
};

export default Layer;
