/* eslint-disable guard-for-in */
import {GL, glArrayFromType} from 'luma.gl';
import {log} from './utils';
import assert from 'assert';
function noop() {}

var AttributeManager = function AttributeManager(ref) {
  if ( ref === void 0 ) ref = {};
  var id = ref.id; if ( id === void 0 ) id = 'attribute-manager';

  this.id = id;
  this.attributes = {};
  this.allocedInstances = -1;
  this.needsRedraw = true;
  this.userData = {};

  this.onUpdateStart = noop;
  this.onUpdateEnd = noop;
  this.onLog = this._defaultLog;

  // For debugging sanity, prevent uninitialized members
  Object.seal(this);
};

/**
 * Adds attributes
 * Takes a map of attribute descriptor objects
 * - keys are attribute names
 * - values are objects with attribute fields
 *
 * attribute.size - number of elements per object
 * attribute.updater - number of elements
 * attribute.instanced=0 - is this is an instanced attribute (a.k.a. divisor)
 * attribute.noAlloc=false - if this attribute should not be allocated
 *
 * @example
 * attributeManager.add({
 * positions: {size: 2, update: calculatePositions}
 * colors: {size: 3, update: calculateColors}
 * });
 *
 * @param {Object} attributes - attribute map (see above)
 * @param {Object} updaters - separate map of update functions (deprecated)
 */
AttributeManager.prototype.add = function add (attributes, updaters) {
    if ( updaters === void 0 ) updaters = {};

  this._add(attributes, updaters);
};

// Marks an attribute for update
AttributeManager.prototype.invalidate = function invalidate (attributeName) {
  var ref = this;
    var attributes = ref.attributes;
  var attribute = attributes[attributeName];
  if (!attribute) {
    var message =
      "invalidating non-existent attribute " + attributeName + " for " + (this.id) + "\n";
    message += "Valid attributes: " + (Object.keys(attributes).join(', '));
    assert(attribute, message);
  }
  attribute.needsUpdate = true;
  // For performance tuning
  this.onLog(1, ("invalidated attribute " + attributeName + " for " + (this.id)));
};

AttributeManager.prototype.invalidateAll = function invalidateAll () {
    var this$1 = this;

  var ref = this;
    var attributes = ref.attributes;
  for (var attributeName in attributes) {
    this$1.invalidate(attributeName);
  }
};

/**
 * Ensure all attribute buffers are updated from props or data.
 *
 * Note: Any preallocated buffers in "buffers" matching registered attribute
 * names will be used. No update will happen in this case.
 * Note: Calls onUpdateStart and onUpdateEnd log callbacks before and after.
 *
 * @param {Object} opts - options
 * @param {Object} opts.data - data (iterable object)
 * @param {Object} opts.numInstances - count of data
 * @param {Object} opts.buffers = {} - pre-allocated buffers
 * @param {Object} opts.props - passed to updaters
 * @param {Object} opts.context - Used as "this" context for updaters
 */
AttributeManager.prototype.update = function update (ref) {
    if ( ref === void 0 ) ref = {};
    var data = ref.data;
    var numInstances = ref.numInstances;
    var buffers = ref.buffers; if ( buffers === void 0 ) buffers = {};
    var props = ref.props; if ( props === void 0 ) props = {};
    var context = ref.context; if ( context === void 0 ) context = {};
    var ignoreUnknownAttributes = ref.ignoreUnknownAttributes; if ( ignoreUnknownAttributes === void 0 ) ignoreUnknownAttributes = false;

  // First apply any application provided buffers
  this._checkExternalBuffers({buffers: buffers, ignoreUnknownAttributes: ignoreUnknownAttributes});
  this._setExternalBuffers(buffers);

  // Only initiate alloc/update (and logging) if actually needed
  if (this._analyzeBuffers({numInstances: numInstances})) {
    this.onUpdateStart(this.id);
    this._updateBuffers({numInstances: numInstances, data: data, props: props, context: context});
    this.onUpdateEnd(this.id);
  }
};

/**
 * Sets log functions to help trace or time attribute updates.
 * Default logging uses luma logger.
 *
 * Note that the app may not be in control of when update is called,
 * so hooks are provided for update start and end.
 *
 * @param {Object} [opts]
 * @param {String} [opts.onLog=] - called to print
 * @param {String} [opts.onUpdateStart=] - called before update() starts
 * @param {String} [opts.onUpdateEnd=] - called after update() ends
 */
AttributeManager.prototype.setLogFunctions = function setLogFunctions (ref) {
    if ( ref === void 0 ) ref = {};
    var onLog = ref.onLog;
    var onUpdateStart = ref.onUpdateStart;
    var onUpdateEnd = ref.onUpdateEnd;

  this.onLog = onLog !== undefined ? onLog : this.onLog;
  this.onUpdateStart =
    onUpdateStart !== undefined ? onUpdateStart : this.onUpdateStart;
  this.onUpdateEnd =
    onUpdateEnd !== undefined ? onUpdateEnd : this.onUpdateEnd;
};

/**
 * Returns all attribute descriptors
 * Note: Format matches luma.gl Model/Program.setAttributes()
 * @return {Object} attributes - descriptors
 */
AttributeManager.prototype.getAttributes = function getAttributes () {
  return this.attributes;
};

/**
 * Returns changed attribute descriptors
 * This indicates which WebGLBuggers need to be updated
 * @return {Object} attributes - descriptors
 */
AttributeManager.prototype.getChangedAttributes = function getChangedAttributes (ref) {
    var clearChangedFlags = ref.clearChangedFlags; if ( clearChangedFlags === void 0 ) clearChangedFlags = false;

  var ref$1 = this;
    var attributes = ref$1.attributes;
  var changedAttributes = {};
  for (var attributeName in attributes) {
    var attribute = attributes[attributeName];
    if (attribute.changed) {
      attribute.changed = attribute.changed && !clearChangedFlags;
      changedAttributes[attributeName] = attribute;
    }
  }
  return changedAttributes;
};

/**
 * Returns the redraw flag, optionally clearing it.
 * Redraw flag will be set if any attributes attributes changed since
 * flag was last cleared.
 *
 * @param {Object} [opts]
 * @param {String} [opts.clearRedrawFlags=false] - whether to clear the flag
 * @return {Boolean} - whether a redraw is needed.
 */
AttributeManager.prototype.getNeedsRedraw = function getNeedsRedraw (ref) {
    if ( ref === void 0 ) ref = {};
    var clearRedrawFlags = ref.clearRedrawFlags; if ( clearRedrawFlags === void 0 ) clearRedrawFlags = false;

  var redraw = this.needsRedraw;
  redraw = redraw || this.needsRedraw;
  this.needsRedraw = this.needsRedraw && !clearRedrawFlags;
  return redraw;
};

/**
 * Sets the redraw flag.
 * @param {Boolean} redraw=true
 * @return {AttributeManager} - for chaining
 */
AttributeManager.prototype.setNeedsRedraw = function setNeedsRedraw (redraw) {
    if ( redraw === void 0 ) redraw = true;

  this.needsRedraw = true;
  return this;
};

// DEPRECATED METHODS

/**
 * @deprecated since version 2.5, use add() instead
 * Adds attributes
 * @param {Object} attributes - attribute map (see above)
 * @param {Object} updaters - separate map of update functions (deprecated)
 */
AttributeManager.prototype.addDynamic = function addDynamic (attributes, updaters) {
    if ( updaters === void 0 ) updaters = {};

  this._add(attributes, updaters);
};

/**
 * @deprecated since version 2.5, use add() instead
 * Adds attributes
 * @param {Object} attributes - attribute map (see above)
 * @param {Object} updaters - separate map of update functions (deprecated)
 */
AttributeManager.prototype.addInstanced = function addInstanced (attributes, updaters) {
    if ( updaters === void 0 ) updaters = {};

  this._add(attributes, updaters, {instanced: 1});
};

// PRIVATE METHODS

// Default logger
AttributeManager.prototype._defaultLog = function _defaultLog (level, message) {
  log.log(level, message);
};

// Used to register an attribute
AttributeManager.prototype._add = function _add (attributes, updaters, _extraProps) {
    var this$1 = this;
    if ( updaters === void 0 ) updaters = {};
    if ( _extraProps === void 0 ) _extraProps = {};


  var newAttributes = {};

  for (var attributeName in attributes) {
    // support for separate update function map
    // For now, just copy any attributes from that map into the main map
    // TODO - Attribute maps are a deprecated feature, remove
    if (attributeName in updaters) {
      attributes[attributeName] =
        Object.assign({}, attributes[attributeName], updaters[attributeName]);
    }

    var attribute = attributes[attributeName];

    // Check all fields and generate helpful error messages
    this$1._validate(attributeName, attribute);

    // Initialize the attribute descriptor, with WebGL and metadata fields
    var attributeData = Object.assign(
      {
        // Ensure that fields are present before Object.seal()
        target: undefined,
        isIndexed: false,

        // Reserved for application
        userData: {}
      },
      // Metadata
      attribute,
      {
        // State
        isExternalBuffer: false,
        needsAlloc: false,
        needsUpdate: false,
        changed: false,

        // Luma fields
        size: attribute.size,
        value: attribute.value || null
      },
      _extraProps
    );
    // Sanity - no app fields on our attributes. Use userData instead.
    Object.seal(attributeData);

    // Add to both attributes list (for registration with model)
    this$1.attributes[attributeName] = attributeData;
  }

  Object.assign(this.attributes, newAttributes);
};

AttributeManager.prototype._validate = function _validate (attributeName, attribute) {
  assert(typeof attribute.size === 'number',
    ("Attribute definition for " + attributeName + " missing size"));

  // Check the updater
  assert(typeof attribute.update === 'function' || attribute.noAlloc,
    ("Attribute updater for " + attributeName + " missing update method"));
};

// Checks that any attribute buffers in props are valid
// Note: This is just to help app catch mistakes
AttributeManager.prototype._checkExternalBuffers = function _checkExternalBuffers (ref) {
    if ( ref === void 0 ) ref = {};
    var buffers = ref.buffers; if ( buffers === void 0 ) buffers = {};
    var ignoreUnknownAttributes = ref.ignoreUnknownAttributes; if ( ignoreUnknownAttributes === void 0 ) ignoreUnknownAttributes = false;

  var ref$1 = this;
    var attributes = ref$1.attributes;
  for (var attributeName in buffers) {
    var attribute = attributes[attributeName];
    if (!attribute && !ignoreUnknownAttributes) {
      throw new Error(("Unknown attribute prop " + attributeName));
    }
    // const buffer = buffers[attributeName];
    // TODO - check buffer type
  }
};

// Set the buffers for the supplied attributes
// Update attribute buffers from any attributes in props
// Detach any previously set buffers, marking all
// Attributes for auto allocation
/* eslint-disable max-statements */
AttributeManager.prototype._setExternalBuffers = function _setExternalBuffers (bufferMap) {
    var this$1 = this;

  var ref = this;
    var attributes = ref.attributes;
    var numInstances = ref.numInstances;

  // Copy the refs of any supplied buffers in the props
  for (var attributeName in attributes) {
    var attribute = attributes[attributeName];
    var buffer = bufferMap[attributeName];
    attribute.isExternalBuffer = false;
    if (buffer) {
      if (!(buffer instanceof Float32Array)) {
        throw new Error('Attribute properties must be of type Float32Array');
      }
      if (attribute.auto && buffer.length <= numInstances * attribute.size) {
        throw new Error('Attribute prop array must match length and size');
      }

      attribute.isExternalBuffer = true;
      attribute.needsUpdate = false;
      if (attribute.value !== buffer) {
        attribute.value = buffer;
        attribute.changed = true;
        this$1.needsRedraw = true;
      }
    }
  }
};
/* eslint-enable max-statements */

/* Checks that typed arrays for attributes are big enough
 * sets alloc flag if not
 * @return {Boolean} whether any updates are needed
 */
AttributeManager.prototype._analyzeBuffers = function _analyzeBuffers (ref) {
    var numInstances = ref.numInstances;

  var ref$1 = this;
    var attributes = ref$1.attributes;
  assert(numInstances !== undefined, 'numInstances not defined');

  // Track whether any allocations or updates are needed
  var needsUpdate = false;

  for (var attributeName in attributes) {
    var attribute = attributes[attributeName];
    if (!attribute.isExternalBuffer) {
      // Do we need to reallocate the attribute's typed array?
      var needsAlloc =
        attribute.value === null ||
        attribute.value.length / attribute.size < numInstances;
      if (needsAlloc && attribute.update) {
        attribute.needsAlloc = true;
        needsUpdate = true;
      }
      if (attribute.needsUpdate) {
        needsUpdate = true;
      }
    }
  }

  return needsUpdate;
};

/**
 * @private
 * Calls update on any buffers that need update
 * TODO? - If app supplied all attributes, no need to iterate over data
 *
 * @param {Object} opts - options
 * @param {Object} opts.data - data (iterable object)
 * @param {Object} opts.numInstances - count of data
 * @param {Object} opts.buffers = {} - pre-allocated buffers
 * @param {Object} opts.props - passed to updaters
 * @param {Object} opts.context - Used as "this" context for updaters
 */
/* eslint-disable max-statements */
AttributeManager.prototype._updateBuffers = function _updateBuffers (ref) {
    var this$1 = this;
    var numInstances = ref.numInstances;
    var data = ref.data;
    var props = ref.props;
    var context = ref.context;

  var ref$1 = this;
    var attributes = ref$1.attributes;

  // Allocate at least one element to ensure a valid buffer
  var allocCount = Math.max(numInstances, 1);

  for (var attributeName in attributes) {
    var attribute = attributes[attributeName];

    // Allocate a new typed array if needed
    if (attribute.needsAlloc) {
      var ArrayType = glArrayFromType(attribute.type || GL.FLOAT);
      attribute.value = new ArrayType(attribute.size * allocCount);
      this$1.onLog(2, ((this$1.id) + ":" + attributeName + " allocated " + allocCount));
      attribute.needsAlloc = false;
      attribute.needsUpdate = true;
    }

    // Call updater function if needed
    if (attribute.needsUpdate) {
      var update = attribute.update;
      if (update) {
        this$1.onLog(2, ((this$1.id) + ":" + attributeName + " updating " + numInstances));
        update.call(context, attribute, {data: data, props: props, numInstances: numInstances});
      } else {
        this$1.onLog(2, ((this$1.id) + ":" + attributeName + " missing update function"));
      }
      attribute.needsUpdate = false;
      attribute.changed = true;
      this$1.needsRedraw = true;
    }
  }

  this.allocedInstances = allocCount;
};

export default AttributeManager;
