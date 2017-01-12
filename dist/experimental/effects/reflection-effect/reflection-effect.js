/* global window */
import {GL, Framebuffer, Model, Geometry} from 'luma.gl';
import {assembleShaders} from '../../../shader-utils';
import {Effect} from '../../lib';
import {readFileSync} from 'fs';
import {join} from 'path';
// import {WebMercatorViewport} from 'viewport-mercator-project';
import {WebMercatorViewport} from '../../../lib/viewports';

var ReflectionEffect = (function (Effect) {
  function ReflectionEffect(reflectivity, blur) {
    if ( reflectivity === void 0 ) reflectivity = 0.5;
    if ( blur === void 0 ) blur = 0.5;

    Effect.call(this);
    this.reflectivity = reflectivity;
    this.blur = blur;
    this.framebuffer = null;
    this.setNeedsRedraw();
  }

  if ( Effect ) ReflectionEffect.__proto__ = Effect;
  ReflectionEffect.prototype = Object.create( Effect && Effect.prototype );
  ReflectionEffect.prototype.constructor = ReflectionEffect;

  ReflectionEffect.prototype.getShaders = function getShaders () {
    return {
      vs: readFileSync(join(__dirname, './reflection-effect-vertex.glsl'), 'utf8'),
      fs: readFileSync(join(__dirname, './reflection-effect-fragment.glsl'), 'utf8')
    };
  };

  ReflectionEffect.prototype.initialize = function initialize (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

    var shaders = assembleShaders(gl, this.getShaders());

    this.unitQuad = new Model({
      gl: gl,
      id: 'reflection-effect',
      vs: shaders.vs,
      fs: shaders.fs,
      geometry: new Geometry({
        drawMode: GL.TRIANGLE_FAN,
        vertices: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
      })
    });
    this.framebuffer = new Framebuffer(gl, {depth: true});

  };

  ReflectionEffect.prototype.preDraw = function preDraw (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

    var ref$1 = layerManager.context;
    var viewport = ref$1.viewport;
    /*
     * the renderer already has a reference to this, but we don't have a reference to the renderer.
     * when we refactor the camera code, we should make sure we get a reference to the renderer so
     * that we can keep this in one place.
     */
    var dpi = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.framebuffer.resize({width: dpi * viewport.width, height: dpi * viewport.height});
    var pitch = viewport.pitch;
    this.framebuffer.bind();
    /* this is a huge hack around the existing viewport class.
     * TODO in the future, once we implement bona-fide cameras, we really need to fix this.
     */
    layerManager.setViewport(
      new WebMercatorViewport(Object.assign({}, viewport, {pitch: -180 - pitch}))
    );
    gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

    layerManager.drawLayers();
    layerManager.setViewport(viewport);
    this.framebuffer.unbind();
  };

  ReflectionEffect.prototype.draw = function draw (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

    /*
     * Render our unit quad.
     * This will cover the entire screen, but will lie behind all other geometry.
     * This quad will sample the previously generated reflection texture
     * in order to create the reflection effect
     */
    this.unitQuad.render({
      reflectionTexture: this.framebuffer.texture,
      reflectionTextureWidth: this.framebuffer.width,
      reflectionTextureHeight: this.framebuffer.height,
      reflectivity: this.reflectivity,
      blur: this.blur
    });
  };

  ReflectionEffect.prototype.finalize = function finalize (ref) {
    var gl = ref.gl;
    var layerManager = ref.layerManager;

    /* TODO: Free resources? */
  };

  return ReflectionEffect;
}(Effect));

export default ReflectionEffect;
