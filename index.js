"use strict";
let options = {}, services = {}, server = null;
let getServer = (next) => {
    if (!server) {
      options.config = options.config || 'etc/config.js';
      options.path = options.path || 'sys';
      server = require('./lib/core.js')(options, services);
    }
    return server;
};
module.exports = {
  init: (o) => {
    options = o;
  },
  getCore: () => getServer().getCore(),
  start: (next, onExit) => getServer().start(next, onExit),
  use: (serviceName, instance) => services[serviceName] = instance || null
};