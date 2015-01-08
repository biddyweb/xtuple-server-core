var lib = require('xtuple-server-lib'),
  rimraf = require('rimraf'),
  _ = require('lodash'),
  semver = require('semver'),
  n = require('n-api'),
  path = require('path'),
  fs = require('fs');

/**
 * Build the specified xTuple database(s)
 */
_.extend(exports, lib.task, /** @exports xtuple-server-xt-database */ {

  options: {
    version: {
      optional: '[version]',
      description: 'xTuple Version',
      validate: function (value, options) {
        if (_.isEmpty(value) && _.isObject(options.local)) {
          return require(path.resolve(options.local.workspace, 'package')).version;
        }
        if (/^[0-9A-Fa-f]+$/.test(value)) {
          options.xt.gitVersion = value.slice(0, 7);
          return options.xt.gitVersion;
        }
        if (semver.valid(value)) {
          options.xt.gitVersion = 'v' + value;
          return value;
        }
        // Valid git branch names.
        // https://www.kernel.org/pub/software/scm/git/docs/git-check-ref-format.html
        if (/^(?!\/|.*(?:[/.]\.|\/\/|@\{|\\))[^\040\177 ~^:?*[]+$/.test(value)
          && value.indexOf('.lock', value.length - 5) === -1
          && value.indexOf('.', value.length - 1) === -1
          && value.indexOf('/', value.length - 1) === -1) {
          options.xt.gitVersion = value;
          return value;
        }

        throw new TypeError('Specified version is not valid: '+ value);
      }
    },
    name: {
      optional: '[name]',
      description: 'Name of the installation',
      validate: function (value, options) {
        if (_.isEmpty(value) && _.isEmpty(options.local)) {
          log.warn('xt-database validate', 'xt-name was empty. Defaulting to', process.env.SUDO_USER);
          return process.env.SUDO_USER;
        }
        if (/\d/.test(value)) {
          throw new Error('xt.name cannot contain numbers');
        }

        return value;
      }
    },
    maindb: {
      optional: '[path]',
      description: 'Path to primary database .backup/.sql filename to use in production',
      validate: function (value, options) {
        if (_.isEmpty(value)) return null;

        if (!fs.existsSync(path.resolve(value))) {
          throw new Error('specified xt-maindb file does not exist: '+ value);
        }
        if (options.xt.demo || options.xt.quickstart || options.xt.empty) {
          log.warn('xt-install', 'demo, empty, and quickstart, source dbs cannot be used with xt-maindb');
          log.warn('xt-install', 'ignoring options --xt-demo, --xt-quickstart, and --xt-empty');
        }

        options.xt.demo = false;
        options.xt.quickstart = false;
        options.xt.empty = false;

        return value;
      }
    },
    edition: {
      optional: '[string]',
      description: 'The xTuple Edition to install',
      value: 'core'
    },
    demo: {
      optional: '[boolean]',
      description: 'Set to install the demo database',
      filename: 'postbooks_demo_data.sql',
      value: false
    },
    quickstart: {
      optional: '[boolean]',
      description: 'Set to install the quickstart database',
      filename: 'quickstart_data.sql',
      value: false
    },
    empty: {
      optional: '[boolean]',
      description: 'Set to install the empty database',
      filename: 'empty_data.sql',
      value: false
    },
    adminpw: {
      optional: '[password]',
      description: 'Password for the database "admin" user for a new database'
    }
  },

  /** @override */
  beforeInstall: function (options) {
    options.xt.database || (options.xt.database = { });

    options.xt.database.list = _.compact(_.map([ 'demo', 'quickstart', 'empty' ], function (db) {
      return options.xt[db] ? {
        dbname: db + '_' + options.type,
        filename: path.resolve(options.xt.coredir, 'foundation-database', exports.options[db].filename),
        type: 's'
      } : null;
    }));

    // schedule main database file for installation
    if (!_.isEmpty(options.xt.maindb)) {
      options.xt.database.list.push({
        dbname: lib.util.getDatabaseName(options.xt.maindb, options.type),
        filename: path.resolve(options.xt.maindb),
        type: 'b'
      });
    }

    if (/^install/.test(options.planName) && options.xt.database.list.length === 0) {
      throw new Error('No databases have been specified for installation');
    }
  },

  /**
   * @param options.xt.nodeVersion
   * @param options.xt.coredir
   * @param options.xt.edition
   * @override
   */
  executeTask: function (options) {
    n(options.xt.nodeVersion);

    rimraf.sync(path.resolve(options.xt.coredir, 'scripts/lib/build'));

    _.each(options.xt.database.list, function (db) {
      exports.buildCore(options, db);

      if (db.type === 's') {
        exports.buildExtensions(lib.util.editions[options.xt.edition], db, options);
      }
    });

    n(process.version);
  },
  
  // build all specified databases
  buildCore: function (options, db) {
    lib.util.runCmd(lib.util.getDatabaseBuildCommand(db, options));
  },

  // install extensions specified by the edition
  buildExtensions: function (extensions, db, options) {
    _.each(extensions, function (ext) {
      lib.util.runCmd(lib.util.getExtensionBuildCommand(db, options, ext));
    });
  }
});
