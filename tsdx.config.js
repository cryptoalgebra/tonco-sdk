const dotenv = require('rollup-plugin-dotenv');

module.exports = {
    rollup(config, options) {
      config.plugins.unshift(dotenv.default({}));
      return config;
    },
  };