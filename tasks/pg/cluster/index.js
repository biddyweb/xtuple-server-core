var lib = require('xtuple-server-lib'),
  config = require('xtuple-server-pg-config'),
  _ = require('lodash'),
  path = require('path');

/**
 * Create a new postgres cluster and prime it to the point of being able
 * to receive import of xtuple databases.
 */
_.extend(exports, lib.task, /** @exports cluster */ {

  options: {
    port: {
      optional: '[integer]',
      description: 'Assign postgres cluster to bind on a specific port.',
      value: null,
      validate: function (value, options) {
        var cluster = _.findWhere(lib.pgCli.lsclusters(), { port: value });
        if (!_.isEmpty(cluster)) {
          throw new Error('pg.port ('+ value +') is already assigned to another cluster');
        }

        return value;
      }
    }
  },

  /** @override */
  beforeInstall: function (options) {
    options.pg.cluster = {
      owner: options.xt.name,
      name: lib.util.$(options),
      version: parseFloat(options.pg.version)
    };
    var exists = _.findWhere(lib.pgCli.lsclusters(), options.pg.cluster);

    if (exists) {
      throw new Error('Cluster already exists: ' + options.pg.cluster.name);
    }
    options.pg.configdir = path.resolve('/etc/postgresql', options.pg.version, options.xt.name);
  },

  /** @override */
  executeTask: function (options) {
    _.extend(options.pg.cluster, lib.pgCli.createcluster(options));
    lib.pgCli.ctlcluster(options, 'restart');
    exports.initCluster(options);
  },

  /** @override */
  afterInstall: function (options) {
    if (/^install/.test(options.planName)) {
      options.report['Postgres Instance'] = {
        'Cluster Name': options.pg.cluster.name,
        'Port Number': options.pg.cluster.port,
        'Database Names': _.pluck(options.xt.database.list, 'dbname').join(', '),
      };
    }
  },

  /** @override */
  uninstall: function (options) {
    try {
      config.discoverCluster(options);

      lib.pgCli.ctlcluster(options, 'stop');
      lib.pgCli.dropcluster(options);
    }
    catch (e) {
      // do nothing
    }

  },

  /**
   * Setup an existing, empty-ish cluster to receive xtuple.
   */
  initCluster: function (options) {
    lib.pgCli.createdb(options, options.xt.name, options.xt.name);

    // <http://www.postgresql.org/docs/9.3/static/sql-createrole.html>
    var queries = [
        'CREATE EXTENSION IF NOT EXISTS plv8',
        'CREATE EXTENSION IF NOT EXISTS plpgsql',
        'CREATE EXTENSION IF NOT EXISTS hstore',

        // create 'admin' user (this is the default xtuple admin user)
        'CREATE ROLE admin WITH LOGIN PASSWORD \'{xt.adminpw}\' SUPERUSER'.format(options),

        // TODO revisit when xtuple/xtuple#1472 is resolved
        //'CREATE ROLE admin WITH LOGIN PASSWORD \'{xt.adminpw}\' CREATEDB CREATEROLE INHERIT'.format(options),

        // create xtrole
        'CREATE ROLE xtrole WITH ROLE admin',

        // create 'postgres' role for convenience + compatibility
        'CREATE ROLE postgres LOGIN SUPERUSER',

        'GRANT xtrole TO admin',
        'GRANT xtrole TO {xt.name}'.format(options)
      ],
      results = _.map(queries, _.partial(lib.pgCli.psql, options));

    log.verbose('pg.cluster initCluster', results);
  }
});
