import assert from 'assert';

/**
 * Performs equality by iterating through keys on an object and returning false
 * when any key has values which are not strictly equal between the arguments.
 * @param {Object} opt.oldProps - object with old key/value pairs
 * @param {Object} opt.newProps - object with new key/value pairs
 * @param {Object} opt.ignoreProps={} - object, keys that should not be compared
 * @returns {null|String} - null when values of all keys are strictly equal.
 *   if unequal, returns a string explaining what changed.
 */
/* eslint-disable max-statements, complexity */
export function compareProps(ref) {
  if ( ref === void 0 ) ref = {};
  var oldProps = ref.oldProps;
  var newProps = ref.newProps;
  var ignoreProps = ref.ignoreProps; if ( ignoreProps === void 0 ) ignoreProps = {};

  assert(oldProps !== undefined && newProps !== undefined, 'compareProps args');

  if (oldProps === newProps) {
    return null;
  }

  if (typeof oldProps !== 'object' || oldProps === null) {
    return 'old props is not an object';
  }
  if (typeof newProps !== 'object' || newProps === null) {
    return 'new props is not an object';
  }

  // Test if new props different from old props
  for (var key in oldProps) {
    if (!(key in ignoreProps)) {
      if (!newProps.hasOwnProperty(key)) {
        return ("prop " + key + " dropped: " + (oldProps[key]) + " -> (undefined)");
      } else if (oldProps[key] !== newProps[key]) {
        return ("prop " + key + " changed: " + (oldProps[key]) + " -> " + (newProps[key]));
      }
    }
  }

  // Test if any new props have been added
  for (var key$1 in newProps) {
    if (!(key$1 in ignoreProps)) {
      if (!oldProps.hasOwnProperty(key$1)) {
        return ("prop " + key$1 + " added: (undefined) -> " + (newProps[key$1]));
      }
    }
  }

  return null;
}
/* eslint-enable max-statements, complexity */

// Shallow compare
/* eslint-disable complexity */
export function areEqualShallow(a, b, ref) {
  if ( ref === void 0 ) ref = {};
  var ignore = ref.ignore; if ( ignore === void 0 ) ignore = {};


  if (a === b) {
    return true;
  }

  if (typeof a !== 'object' || a === null ||
    typeof b !== 'object' || b === null) {
    return false;
  }

  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }

  for (var key in a) {
    if (!(key in ignore) && (!(key in b) || a[key] !== b[key])) {
      return false;
    }
  }
  for (var key$1 in b) {
    if (!(key$1 in ignore) && (!(key$1 in a))) {
      return false;
    }
  }
  return true;
}
