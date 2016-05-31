"use strict";
let restify = require('restify'), _ = require('lodash'), services = {};
let codes = {
  FAILED: -1,
  ERROR: 0,
  SUCCESS: 1
};
let restServer = function(core, options) {
  services = options.services || {};
  let config = options.config || {};
  // start restify server
  let server = restify.createServer({
    name: config.name || 'Beauty Restful API Server',
    version: config.version || '1.0.0'
  });
  server.use(restify.queryParser({ mapParams: false }));
  server.use(restify.bodyParser({ maxFieldsSize: 10485760, mapParams: false }));
  server.use(restify.gzipResponse());
  server.on('error', core.getErrorHandler());
  server.on('UnsupportedMediaType', (req, res) => {
    res.send(400, { code: codes.FAILED, message: 'Request format is wrong.' });
  });
  let funcNotFound = (req, res) => {
    res.send(404, { code: codes.FAILED, message: 'Method not found.' });
  };
  server.on('NotFound', funcNotFound);
  server.on('MethodNotAllowed',funcNotFound);
  server.on('VersionNotAllowed', funcNotFound);
  server.on('NotAuthorized', (req, res) => {
    res.send(403, { code: codes.FAILED, message: 'Access denied.' });
  });
  server.on('uncaughtException', (req, res, route, error) => {
    if (!res.headersSent) {
      res.send(500, { code: codes.ERROR, message: 'Error: ' + error });
    }
  });
  server.pre((req, res, next) => {
    do {
      // check token
      let headers = req.headers;
      if (headers.token === undefined) {
        break;
      }
      if (_.isArray(config.token)) {
        // config is an array
        if (!_.includes(config.token, headers.token)) {
          break;
        }
      } else if (headers.token !== config.token) {
        // config is only one token
        break;
      }
      // check remote ip
      if (config.ip_list && config.ip_list.length) {
        if (!_.includes(config.ip_list, req.socket.remoteAddress)) {
          break;
        }
      }
      return next();
    } while (0);
    return next(new restify.errors.NotAuthorizedError());
  });
  // response callback
  let funcRespond = (req, res, next) => {
    let service = req.params.service, instance,
        method = req.method.toLowerCase() + '_' + (req.params.method || 'default');
    if (services[service] === undefined || ((instance = services[service]) &&
        typeof instance[method] !== 'function')) {
      return next(new restify.errors.NotFoundError());
    }
    // output and next
    let funcNext = (result) => {
      if (result === undefined) {
        res.send(200, { code: codes.SUCCESS });
      } else {
        res.send(200, { code: codes.SUCCESS, result: result });
      }
      return next();
    };

    if (instance[method].length == 3) {
      // async callback
      instance[method](req, res, funcNext);
    } else {
      // sync
      funcNext(instance[method](req, res));
    }
  };
  server.get(':service', funcRespond);
  server.post(':service', funcRespond);
  server.put(':service', funcRespond);
  server.del(':service', funcRespond);
  server.get(':service/:method', funcRespond);
  server.post(':service/:method', funcRespond);
  server.put(':service/:method', funcRespond);
  server.del(':service/:method', funcRespond);
  // close restify server
  this.close = () => {
    // uninit services
    _.forEach(services, (service) => {
      if (typeof service.uninit === 'function') {
        service.uninit();
      }
    });
    services = {};
    if (server) {
      server.close();
    }
  };
  // listen
  let funcRun = () => {
    server.listen(config.port || 9080, config.host || null, () => {
      console.log('REST server started [' + process.pid + '], address: ' + server.url);
    });
  };

  // start services
  this.getService = (service) => {
    return services[service] !== undefined ? services[service] : false;
  };

  // init service
  core.forEach(services, (service, serviceName, next) => {
    let domainLoader = require('domain').create();
    domainLoader.on('error', (error) => {
      console.log('Service [' + serviceName + '] load error');
      (core.getErrorHandler())(error, 'fatal');
    });
    domainLoader.run(() => {
      if (typeof service.init === 'function') {
        if (service.init.length == 2) {
          // async callback
          return service.init(core, () => {
            delete service.init;
            next();
          });
        } else {
          // sync
          service.init(core);
          delete service.init;
        }
      }
      next();
    });
  }, () => setImmediate(funcRun));
  return this;
};

module.exports = (core, options) => {
  return new restServer(core, options);
};