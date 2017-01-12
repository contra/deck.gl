import {glGetDebugInfo} from 'luma.gl';

// Load shader chunks
// import SHADER_CHUNKS from '../../dist/shaderlib/shader-chunks';
import * as SHADER_CHUNKS from './shader-chunks';

export function checkRendererVendor(debugInfo, gpuVendor) {
  var vendor = debugInfo.vendor;
  var renderer = debugInfo.renderer;
  var result;
  switch (gpuVendor) {
  case 'nvidia':
    result = vendor.match(/NVIDIA/i) || renderer.match(/NVIDIA/i);
    break;
  case 'intel':
    result = vendor.match(/INTEL/i) || renderer.match(/INTEL/i);
    break;
  case 'amd':
    result =
      vendor.match(/AMD/i) || renderer.match(/AMD/i) ||
      vendor.match(/ATI/i) || renderer.match(/ATI/i);
    break;
  default:
    result = false;
  }
  return result;
}

export function getPlatformShaderDefines(gl) {
  /* eslint-disable */
  var platformDefines = '';
  var debugInfo = glGetDebugInfo(gl);

  if (checkRendererVendor(debugInfo, 'nvidia')) {
    platformDefines += "#define NVIDIA_GPU\n#define NVIDIA_FP64_WORKAROUND 1\n#define NVIDIA_EQUATION_WORKAROUND 1\n";
  } else if (checkRendererVendor(debugInfo, 'intel')) {
    platformDefines += "#define INTEL_GPU\n#define INTEL_FP64_WORKAROUND 1\n#define NVIDIA_EQUATION_WORKAROUND 1\n #define INTEL_TAN_WORKAROUND 1\n";
  } else if (checkRendererVendor(debugInfo, 'amd')) {
    platformDefines += "#define AMD_GPU\n";
  } else {
    platformDefines += "#define DEFAULT_GPU\n";
  }

  return platformDefines;
}

function assembleShader(gl, opts) {
  if ( opts === void 0 ) opts = {};

  var vs = opts.vs;
  var project = opts.project; if ( project === void 0 ) project = true;
  var project64 = opts.project64; if ( project64 === void 0 ) project64 = false;
  var fp64 = opts.fp64; if ( fp64 === void 0 ) fp64 = false;
  if (project64 === true) {
    fp64 = true;
  }
  var source = (getPlatformShaderDefines(gl)) + "\n";
  opts = Object.assign({}, opts, {project: project, project64: project64, fp64: fp64});
  for (var i = 0, list = Object.keys(SHADER_CHUNKS); i < list.length; i += 1) {
    var chunkName = list[i];

    if (opts[chunkName]) {
      source += (SHADER_CHUNKS[chunkName].source) + "\n";
    }
  }
  source += vs;
  return source;
}

export function assembleShaders(gl, opts) {
  return {
    gl: gl,
    vs: assembleShader(gl, opts),
    fs: opts.fs
  };
}
