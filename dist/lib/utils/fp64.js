// TODO - move to shaderlib utilities
export function fp64ify(a) {
  var hiPart = Math.fround(a);
  var loPart = a - Math.fround(a);
  return [hiPart, loPart];
}
