var lib = require('xtuple-server-lib'),
  forge = require('node-forge'),
  rimraf = require('rimraf'),
  _ = require('lodash'),
  path = require('path'),
  fs = require('fs');

/**
 * Generate the config.js file
 */
_.extend(exports, lib.task, /** @exports xtuple-server-xt-config */ {

  options: {
    authkey: {
      optional: '[authkey]',
      description: 'The "enhancedAuthKey" used by the database clients to scramble Postgres passwords',
      value: 'xTuple'
    }
  },

  /** @override */
  beforeTask: function (options) {
    options.xt.port = lib.util.getServerPort(options);
    options.xt.sslport = lib.util.getServerSSLPort(options);
  },

  /** @override */
  executeTask: function (options) {
    exports.writeRunConfig(options);
  },

  writeRunConfig: function (options) {
    exports.writeConfig(options);
  },

  writeConfig: function (options) {
    var xt = options.xt,
      pg = options.pg,
      sample_path = path.resolve(xt.coredir, 'node-datasource/sample_config'),
      sample_config = require(sample_path),
      sample_obj = JSON.parse(JSON.stringify(sample_config)),

      // replace default config.js values
      derived_config_obj = _.extend(sample_obj, {
        processName: 'xt-web-' + options.xt.name,
        datasource: _.extend(sample_config.datasource, {
          name: options.nginx.domain,
          bindAddress: '127.0.0.1',
          keyFile: options.nginx.outkey,
          certFile: options.nginx.outcrt,
          saltFile: options.xt.rand64file,
          encryptionKeyFile: options.xt.key256file,
          enhancedAuthKey: options.xt.authkey,
          hostname: options.nginx.domain,
          description: options.nginx.sitename,
          port: options.xt.sslport,
          redirectPort: options.xt.port,
          databases: _.pluck(xt.database.list, 'dbname'),
          testDatabase: options.xt.testdb
        }),
        databaseServer: _.extend(sample_config.databaseServer, {
          hostname: options.xt.socketdir, // TODO support remote databases via SSL clientcert auth
          user: 'admin',
          password: undefined,
          port: parseInt(pg.cluster.port)
        })
      }),
      output_conf = lib.util.wrapModule(derived_config_obj);

    fs.writeFileSync(options.xt.configfile, output_conf);
        
    // write salt file
    // TODO use node-forge for this
    if (!fs.existsSync(options.xt.rand64file)) {
      fs.writeFileSync(
        options.xt.rand64file,
        lib.util.runCmd('head -c 64 /dev/urandom | base64 | sed "s/[=\\s]//g"').toString()
      );
    }

    // write encryption file if it does not exist
    if (!fs.existsSync(options.xt.key256file)) {
      fs.writeFileSync(
        options.xt.key256file,
        forge.util.bytesToHex(forge.random.getBytesSync(32)).toString()
      );
    }
  },

  /** @override */
  uninstall: function (options) {
    if (!_.isEmpty(options.xt.configdir) && fs.existsSync(options.xt.configdir)) {
      rimraf.sync(options.xt.configdir);
    }
  },

  /** @override */
  afterTask: function (options) {
    lib.util.runCmd([ 'chown', options.xt.name, options.xt.key256file ].join(' '));
    lib.util.runCmd([ 'chown', options.xt.name, options.xt.rand64file ].join(' '));
    lib.util.runCmd([ 'chown', options.xt.name, options.xt.configfile ].join(' '));

    fs.chmodSync(options.xt.key256file, '700');
    fs.chmodSync(options.xt.rand64file, '700');
    fs.chmodSync(options.xt.configfile, '700');
  }
});
