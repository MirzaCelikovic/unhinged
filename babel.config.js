module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  // Worklets plugin must come before the Reanimated plugin; give them unique keys to avoid Babel duplicate detection
  plugins.push(['react-native-worklets/plugin', {}, 'react-native-worklets']);
  plugins.push(['react-native-reanimated/plugin', {}, 'react-native-reanimated']);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],

    plugins,
  };
};
