var lib = require('xtuple-server-lib'),
  _ = require('lodash'),
  cp = require('cp'),
  fs = require('fs'),
  path = require('path');

/**
 * Setup SSL in nginx
 */
_.extend(exports, lib.task, /** @exports xtuple-server-nginx-ssl */ {
  options: {
    sslcnames: {
      optional: '[sslnames]',
      description: 'Additional CN entries for generated SSL cert',
      validate: function (value, options) {
        var names = (value || '').trim().split(',');
        if (_.isEmpty(names)) {
          return [ ];
        }
        return names;
      }
    },
    incrt: {
      optional: '[file]',
      description: 'Path to SSL certificate (.crt)',
      validate: function (value) {
        if (!_.isEmpty(value) && !fs.existsSync(path.resolve(value))) {
          throw new Error('Invalid path for nginx.incrt: '+ value);
        }

        return value;
      }
    },
    inkey: {
      optional: '[file]',
      description: 'Path to SSL private key (.key)',
      validate: function (value) {
        if (!_.isEmpty(value) && !fs.existsSync(path.resolve(value))) {
          throw new Error('Invalid path for nginx.inkey: '+ value);
        }

        return value;
      }
    }
  },

  /** @override */
  beforeTask: function (options) {
    options.nginx.outcrt = path.resolve(options.xt.ssldir, 'server.crt');
    options.nginx.outkey = path.resolve(options.xt.ssldir, 'server.key');
  },

  /** @override */
  executeTask: function (options) {
    if (!_.isEmpty(options.nginx.incrt) && !_.isEmpty(options.nginx.inkey)) {
      options.nginx.incrt = options.nginx.incrt;
      options.nginx.inkey = options.nginx.inkey;

      cp.sync(options.nginx.incrt, options.nginx.outcrt);
      cp.sync(options.nginx.inkey, options.nginx.outkey);
    }
    else if (/localhost/.test(options.nginx.domain)) {
      exports.generate(options);
    }
    else {
      throw new Error([
        'SSL missing required info.',
        'Either a key is missing for a non-localhost domain,',
        'or one of inkey/incrt is invalid or missing'
      ].join('\n'));
    }
  },

  /** @override */
  afterTask: function (options) {
    exports.verifyCertificate(options);

    fs.chmodSync(options.nginx.outkey, '600');
    fs.chmodSync(options.nginx.outcrt, '600');

    lib.util.runCmd('chown -R '+ options.xt.name + ' ' + options.xt.ssldir);
  },

  /**
   * Generate and write a self-signed SSL keypair.
   * @static
   */
  generate: function (options) {
    var cnames = _.compact([ options.nginx.domain ].concat(options.nginx.sslcnames));
    var cmd = [
        'openssl req',
        '-x509 -newkey rsa:2048',
        '-subj \'/CN=' + cnames.join('/CN=') + '\'',
        '-days 365',
        '-nodes',
        '-keyout', options.nginx.outkey,
        '-out', options.nginx.outcrt,
      ].join(' ');

    try {
      lib.util.runCmd(cmd);
    }
    catch (e) {
      log.warn(e);
      throw new Error('could not generate keypair');
    }

    if (!_.isEmpty(options.xt.name)) {
      lib.util.runCmd('chown -R '+ options.xt.name + ' ' + path.dirname(options.nginx.outkey));
    }
    lib.util.runCmd('chmod -R u=rx ' + path.dirname(options.nginx.outkey));

    return cmd;
  },

  /**
   * Perform two-factor verification of the provided SSL files:
   * 1. verify the x509-ness of the outcrt
   * 2. check crt/key modulus equality
   *
   * @param options.nginx.outkey
   * @param options.nginx.outcrt
   * @return true if both of these conditions hold
   */
  verifyCertificate: function (options) {
    var outkey = path.resolve(options.nginx.outkey),
      outcrt = path.resolve(options.nginx.outcrt);

    if (!fs.existsSync(outcrt)) {
      throw new Error('Provided .crt file does not exist: '+ outcrt);
    }
    if (!fs.existsSync(outkey)) {
      throw new Error('Provided .key file does not exist: '+ outkey);
    }

    // verify x509 certificate
    try { 
      lib.util.runCmd('openssl x509 -noout -in ' + outcrt);
    }
    catch (e) {
      log.warn(e);
      throw new Error('The provided .crt failed openssl x509 verify');
    }

    var key_modulus = lib.util.runCmd('openssl rsa -noout -modulus -in '+ outkey).toString().trim(),
      crt_modulus = lib.util.runCmd('openssl x509 -noout -modulus -in '+ outcrt).toString().trim();

    // perform modulus check
    if (key_modulus !== crt_modulus) {
      throw new Error(
        'crt/key moduli inconsistent; ' +
        'basically, the .crt was not created from the specified .key'
      );
    }

    return true;
  }
});
