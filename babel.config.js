module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind", worklets: false }],
      // Inline equivalent of "nativewind/babel" but without react-native-worklets/plugin,
      // which is only needed for CSS animations and requires New Architecture (reanimated v4).
      function () {
        return {
          plugins: [
            require("react-native-css-interop/dist/babel-plugin").default,
            [
              "@babel/plugin-transform-react-jsx",
              { runtime: "automatic", importSource: "react-native-css-interop" },
            ],
          ],
        };
      },
    ],
  };
};