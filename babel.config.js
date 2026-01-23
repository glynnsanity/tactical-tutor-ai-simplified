module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // With Reanimated v4 the Babel plugin moved under react-native-worklets
    // It must be listed last
    plugins: ['react-native-worklets/plugin'],
  };
};
