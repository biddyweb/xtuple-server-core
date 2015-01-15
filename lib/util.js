var path = require('path'),
  exec = require('child_process').execSync,
  moment = require('moment'),
  r = require('node-latest-version'),
  _ = require('lodash'),
  crontab = require('cron-tab');

var util = module.exports = {

  /**
   * Return a xtuple server task; npm install if not found
   */
  requireTask: function (phaseName, taskName) {
    var name = 'xtuple-server-' + phaseName + '-' + taskName;
    try {
      return require(name);
    }
    catch (e) {
      log.info('npm install', name);
      util.runCmd('npm install --no-global ' + name);
    }
    return require(name);
  },

  /**
   * Resolve the latest node version for the xtuple dist
   */
  resolveNodeVersion: function (options, dir) {
    var pkg = require(path.resolve(dir || options.xt.coredir, 'package'));
    var node = pkg.engines && pkg.engines.node;
    options.xt.nodeVersion = r.satisfy.sync(node);
    log.info('xt-install', 'using node', options.xt.nodeVersion);
  },

  /**
   * Execute a process synchronously, including logging the command line.
   * @param command {String|Array} arrays are converted to a space-delimited
   *                               string and executed
   * @param options {Object}       optional, passed to child_process.execSync()
   *                               and used to modify runCmd itself
   * @return stdout as a string (unless `options` indicated ignore stdout?)
   * TODO: return the exit code to allow callers to check & handle errors
   * @public
   */
  runCmd: function (command, options) {
    var cmdStr = _.isArray(command) ? command.join(' ') : command,
        result,
        tries = 1;
    if (_.isObject(options) && options.retry) {
      if (options.retry === true)         tries = 2;
      else if (_.isNumber(options.retry)) tries += options.retry;
      options = _.omit(options, 'retry');
    }

    log.info('cmd', cmdStr);
    for (var i = 1; i <= tries; i++) {
      log.silly('cmd', 'attempt ' + i + ' of ' + tries);
      try {
        if (i > 1) log.warn('cmd', 'retrying');
        result = _.isEmpty(options) ? exec(cmdStr) : exec(cmdStr, options);
      } catch (e) {
        if (i >= tries) {
          try {
            log.error('cmd failed', cmdStr);
            log.error('cmd status', e.status);
            log.error('cmd stdout', e.stdout ? e.stdout.toString() : '[undefined]');
            log.error('cmd stderr', e.stderr ? e.stderr.toString() : '[undefined]');
          } catch (f) {}    // don't let error handling errors mask the
          throw e;
        }
      }
    }
    log.silly('cmd', result ? result.toString() : '[falsy stdout]');
    return result ? result.toString() : result;
  },

  /**
   * Invoke a function on each task
   * @callback func (task, phase, taskName);
   */
  eachTask: function (plan, func, options) {
    _.each(plan, function (phase) {
      _.each(phase.tasks, function (taskName) {
        log.silly(phase.name + '.' + taskName, 'eachTask');
        return func(util.requireTask(phase.name, taskName), phase, taskName);
      });
    });
  },

  /**
   * Create a crontab entry for a xtuple-server cli command
   * @public
   */
  createJob: function (plan, type, schedule, argv, options) {
    var cmd = [ 'sudo', 'xtuple-server', plan, type].concat(argv).join(' ');
    var tab = crontab.load.sync(options.xt.name);
    var job = tab.create(cmd, schedule, 'created during '+ options.planName);
    tab.save.sync();
    return job;
  },

  /**
   * Map edition -> extension[]. These lists of extensions are in addition
   * to the 'core' extensions already installed by default.
   */
  editions: {
    core: [ ],
    manufacturing: [
      'inventory',
      'manufacturing'
    ],
    distribution: [
      'inventory',
      'distribution'
    ],
    enterprise: [
      'inventory',
      'distribution',
      'manufacturing',
      'xdruple'
    ]
  },

  // extension path mapping
  // TODO deprecate with npm modularization
  extension_prefixes: {
    'private': [
      'manufacturing',
      'inventory',
      'distribution',
      'bi',
      'xdruple'
    ],
    'xtuple': [
      'bi-open'
    ]
  },

  /**
   * Generate the build command
   * TODO require build_app module directly
   *
   * @param db { filename: PATH, dbname: STRING, type: 's'/'b' }
   * @param options the typical options object
   * @static
   */
  getDatabaseBuildCommand: function (db, options) {
    var buildApp = path.resolve(options.xt.coredir, 'scripts/build_app.js');
    var cmd = [
        'cd', options.xt.coredir,
        '&& sudo -u', options.xt.name, 'node', buildApp,
        '-c', options.xt.configfile,
        '-d', db.dbname,
        '-i -'+ db.type, db.filename
      ].join(' ');

    log.verbose('lib.util getDatabaseBuildCommand', cmd);

    return cmd;
  },

  /**
   * Generate the extension installation command
   * TODO require build_app module directly
   *
   * @public
   */
  getExtensionBuildCommand: function (db, options, extension) {
    var buildApp = path.resolve(options.xt.coredir, 'scripts/build_app.js');
    var prefix = _.find(_.keys(util.extension_prefixes), function (key) {
      return _.contains(util.extension_prefixes[key], extension);
    });
    var extensionPath = path.resolve(options.xt.userdist, prefix + '-extensions', 'source', extension);
    var cmd = [
      'cd', options.xt.coredir, '&&',
      'sudo -u', options.xt.name, 'node', buildApp,
      '-c', options.xt.configfile,
      '-e', extensionPath, '-f',
      '-d', db.dbname
    ].join(' ');

    log.verbose('lib.util getExtensionBuildCommand', cmd);

    return cmd;
  },

  /**
   * Return whether this installation will install any private extensions
   */
  hasPrivateExtensions: function (options) {
    return _.intersection(
      util.extension_prefixes.private, util.editions[options.xt.edition]
    ).length > 0;
  },

  wrapModule: function (obj) {
    return 'module.exports = '+ JSON.stringify(obj, null, 2) + ';';
  },

  /**
   * Generate password using openssl rand
   * TODO use node-forge
   * @public
   */
  getPassword: function () {
    util.runCmd('sleep 1');
    var pass = util.runCmd('openssl rand 6 | base64');

    if (!_.isEmpty(pass)) {
      return pass.trim().replace(/\W/g, '');
    }
    else {
      throw new Error('Failed to generate password: '+ JSON.stringify(pass));
    }
  },

  /**
   * Return the name of a forked database.
   *
   * @param options.pg.dbname {String}  name of database
   * @param globals           {Boolean} true if this is a backup of the cluster globals
   * @param date              {Date}    optional date object to be formatted as timestamp
   * @public
   */
  getForkName: function (options, globals, date) {
    var timestamp = (moment(date) || moment()).format('MMDDhhmm');
    var prefix = globals ? 'globals' : options.pg.dbname;

    return [ prefix, 'copy', timestamp ].join('_');
  },

  /**
   * Return path of a snapshot file
   *
   * @param options.pg.dbname       {String}  name of database
   * @param options.pg.snapshotdir  {String}  path to the snapshot directory
   * @param globals                 {Boolean} true if this is a backup of the globals
   * @param date                    {Date}    optional date object to be formatted as timestamp
   * @public
   */
  getSnapshotPath: function (options, globals, date) {
    var ext = (globals ? '.sql' : '.dirgz');
    return path.resolve(options.pg.snapshotdir, util.getForkName(options, globals, date) + ext);
  },

  /**
   * Return an object consisting of the backup filename components.
   * @public
   */
  parseForkName: function (filename) {
    var base = path.basename(filename),
      halves = base.split('_copy_');

    return {
      original: filename,
      dbname: halves[0],
      ts: moment(halves[1], 'MMDDhhmm').valueOf()
    };
  },

  /**
   * Derive the name of the instance from the specified parameters.
   * @public
   */
  $: function (options) {
    return options.xt.name + '-' + options.xt.version.replace(/\./g, '') + '-' + options.type;
  },

  /**
   * Offset from the postgres cluster port that this server connects to,
   * default port minus postgres port.
   * (8888 - 5432)
   *
   * Interestingly:
   * (3456 mod 1111) + (5432 mod 1111) = 1111
   *
   * @memberof lib.util
   * @public
   */
  portOffset: 3456,

  /** @public */
  getServerPort: function (options) {
    return parseInt(options.pg.cluster.port) + util.portOffset;
  },

  /** @public */
  getServerSSLPort: function (options) {
    return parseInt(options.pg.cluster.port) + util.portOffset - 445;
  },

  /**
   * TODO use node-forge
   * @public
   */
  getRandom: function (bitlen) {
    return util.runCmd('openssl rand '+ bitlen +' -hex');
  },

  /**
   * @return list of repositories to clone
   * @public
   */
  getRepositoryList: function (options) {
    return _.compact([
      'xtuple',
      'xtuple-extensions',
      util.hasPrivateExtensions(options) && 'private-extensions'
    ]);
  },

  getNpmPackageId: function (name, version) {
    return name + '@' + version;
  },

  /**
   * Return a trimmed and sanitized database name
   */
  getDatabaseName: function (filename, type) {
    var stem = path.basename(filename, path.extname(filename))
      .replace(type, '');

    return (stem + '_' + type)
      .replace(/\./g, '') // remove dots
      .replace(/([_\-\s]+)/g, '_') // turn dashes and whitespace into underscore
      .replace(/^\d+/g, '') // trim leading numbers
      .trim()
      .toLowerCase();
  }
};
