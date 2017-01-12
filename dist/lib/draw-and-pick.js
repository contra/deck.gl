/* global window */
import {GL, glContextWithState} from 'luma.gl';
import {getUniformsFromViewport} from './viewport-uniforms';

export function drawLayers(ref) {
  var layers = ref.layers;

  var layerIndex = 0;
  for (var i = 0, list = layers; i < list.length; i += 1) {
    var layer = list[i];

    if (layer.props.visible) {
      layer.drawLayer({
        uniforms: Object.assign(
          {},
          layer.context.uniforms,
          getUniformsFromViewport(layer.context.viewport, layer.props),
          {layerIndex: layerIndex}
        )
      });
      layerIndex++;
    }
  }
}

/* eslint-disable max-depth, max-statements */
export function pickLayers(gl, ref) {
  var layers = ref.layers;
  var pickingFBO = ref.pickingFBO;
  var uniforms = ref.uniforms; if ( uniforms === void 0 ) uniforms = {};
  var x = ref.x;
  var y = ref.y;
  var mode = ref.mode;

  // Convert from canvas top-left to WebGL bottom-left coordinates
  // And compensate for pixelRatio
  var pixelRatio = typeof window !== 'undefined' ?
    window.devicePixelRatio : 1;
  var deviceX = x * pixelRatio;
  var deviceY = gl.canvas.height - y * pixelRatio;

  // TODO - just return glContextWithState once luma updates
  var pickedInfos = [];

  // Make sure we clear scissor test and fbo bindings in case of exceptions
  // We are only interested in one pixel, no need to render anything else
  glContextWithState(gl, {
    frameBuffer: pickingFBO,
    framebuffer: pickingFBO,
    scissorTest: {x: deviceX, y: deviceY, w: 1, h: 1}
  }, function () {

    var layerIndex = 0;
    var zOrder = 0;

    for (var i = layers.length - 1; i >= 0; --i) {
      var layer = layers[i];

      if (layer.props.visible) {
        layerIndex++;
      }

      if (layer.props.visible && layer.props.pickable) {

        // Clear the frame buffer, render and sample
        gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        var info = createInfo({
          layer: layer,
          pixel: [x, y],
          devicePixel: [deviceX, deviceY],
          pixelRatio: pixelRatio
        });

        layer.pickLayer({
          info: info,
          uniforms: Object.assign({},
            layer.context.uniforms,
            getUniformsFromViewport(layer.context.viewport, layer.props),
            {layerIndex: layerIndex}
          ),
          pickEnableUniforms: {renderPickingBuffer: 1, pickingEnabled: 1},
          pickDisableUniforms: {renderPickingBuffer: 0, pickingEnabled: 0},
          deviceX: deviceX, deviceY: deviceY,
          mode: mode
        });

        if (info.index >= 0) {
          info.picked = true;
          info.zOrder = zOrder++;
          // If props.data is an indexable array, get the object
          if (Array.isArray(layer.props.data)) {
            info.object = layer.props.data[info.index];
          }
        }

        pickedInfos.push(info);
      }
    }
  });

  // Calling callbacks can have async interactions with React
  // which nullifies layer.state.
  var unhandledPickInfos = [];
  for (var i = 0, list = pickedInfos; i < list.length; i += 1) {
    var info = list[i];

    var handled = null;
    switch (mode) {
    case 'click': handled = info.layer.props.onClick(info); break;
    case 'hover': handled = info.layer.props.onHover(info); break;
    default: throw new Error('unknown pick type');
    }

    if (!handled) {
      unhandledPickInfos.push(info);
    }
  }

  return unhandledPickInfos;
}
/* eslint-enable max-depth, max-statements */

function createInfo(ref) {
  var info = ref.info;
  var layer = ref.layer;
  var pixel = ref.pixel;
  var devicePixel = ref.devicePixel;
  var pixelRatio = ref.pixelRatio;

  // Assign a number of potentially useful props to the "info" object
  return {
    layer: layer,
    index: -1,
    picked: false,
    x: pixel[0],
    y: pixel[1],
    pixel: pixel,
    devicePixel: devicePixel,
    pixelRatio: pixelRatio,
    lngLat: layer.unproject(pixel)
  };
}
