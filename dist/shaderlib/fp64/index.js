import fs from 'fs';
import path from 'path';
export var fp64 = {
  interface: 'fp64',
  source: fs.readFileSync(path.join(__dirname, 'math-fp64.glsl'), 'utf8')
};
