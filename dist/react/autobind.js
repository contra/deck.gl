var PREDEFINED = [
  'constructor', 'render', 'componentWillMount', 'componentDidMount',
  'componentWillReceiveProps', 'shouldComponentUpdate', 'componentWillUpdate',
  'componentDidUpdate', 'componentWillUnmount'
];

/**
 * Binds the "this" argument of all functions on a class instance to the instance
 * @param {Object} obj - class instance (typically a react component)
 */
export default function autobind(obj) {
  var proto = Object.getPrototypeOf(obj);
  var propNames = Object.getOwnPropertyNames(proto);
  var loop = function () {
    var key = list[i];

    if (typeof obj[key] === 'function') {
      if (!PREDEFINED.find(function (name) { return key === name; })) {
        obj[key] = obj[key].bind(obj);
      }
    }
  };

  for (var i = 0, list = propNames; i < list.length; i += 1) loop();
}
