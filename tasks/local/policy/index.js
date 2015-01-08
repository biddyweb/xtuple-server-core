var lib = require('xtuple-server-lib'),
  exec = lib.util.runCmd,
  _ = require('lodash'),
  path = require('path'),
  fs = require('fs');

/**
 * Setup proper permissions and ownership for xTuple files and paths
 */
_.extend(exports, lib.task, /** @exports xtuple-server-local-policy */ {

  /** @override */
  beforeInstall: function (options) {
    options.sys || (options.sys = { });
    options.sys.policy || (options.sys.policy = { });
  },

  /** @override */
  beforeTask: function (options) {
    // if account appears new, that is they've provided no main database,
    // snapshot to restore from, or admin password, generate a admin password
    if (!_.isEmpty(options.xt.name) && !options.xt.adminpw && !options.xt.maindb) {
      options.xt.adminpw = lib.util.getPassword();
    }
  },

  /** @override */
  executeTask: function (options) {
    exports.createUserPolicy(options);
  },

  /** @protected */
  createUserPolicy: function (options) {
    try {
      exec('addgroup xtuser');
      exec('usermod -a -G postgres,xtuser '+ options.xt.name);
      exec('usermod -a -G ssl-cert,xtuser,www-data postgres');
    }
    catch (e) {
      log.verbose('local-policy', e.message);
      log.silly('local-policy', e.stack.split('\n'));
    }

    try {
      exec('chown -R '+ options.xt.name +' '+ options.xt.userhome);
      //exec('chown -R postgres:xtuser '+ options.xt.socketdir);

      exec('chown -R postgres:postgres '+ options.xt.socketdir);///var/run/postgresql');
      exec('chmod -R 777 '+ options.xt.socketdir);
    }
    catch (e) {
      log.verbose('local-policy', e.message);
      log.silly('local-policy', e.stack.split('\n'));
    }
  }
});
