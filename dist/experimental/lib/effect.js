var counter = 0;

var Effect = function Effect() {
  this.count = counter++;
  this.visible = true;
  this.priority = 0;
  this.needsRedraw = false;
};

/**
 * subclasses should override to set up any resources needed
 */
Effect.prototype.initialize = function initialize (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

};
/**
 * and subclasses should free those resources here
 */
Effect.prototype.finalize = function finalize (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

};
/**
 * override for a callback immediately before drawing each frame
 */
Effect.prototype.preDraw = function preDraw (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

};
/**
 * override for a callback immediately after drawing a frame's layers
 */
Effect.prototype.draw = function draw (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

};

Effect.prototype.setNeedsRedraw = function setNeedsRedraw (redraw) {
    if ( redraw === void 0 ) redraw = true;

  this.needsRedraw = redraw;
};

export default Effect;
