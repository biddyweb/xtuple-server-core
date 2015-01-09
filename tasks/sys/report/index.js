var lib = require('xtuple-server-lib'),
  mkdirp = require('mkdirp'),
  _ = require('lodash'),
  render = require('prettyjson').render,
  fs = require('fs'),
  logfile = require('npmlog-file'),
  path = require('path');

_.extend(exports, lib.task, /** @exports report */ {

  /** @override */
  beforeInstall: function (options) {
    if (/^install/.test(options.planName)) {
      options.sys.installArgumentsFile = path.resolve(options.xt.configdir, 'install-arguments.json');
      mkdirp.sync(path.dirname(options.sys.installArgumentsFile));
      options.xt && options.xt.configdir && fs.writeFileSync(
        path.resolve(options.xt.configdir, 'install-arguments.json'),
        JSON.stringify(options, null, 2)
      );
    }
    options.report || (options.report =  { });
  },

  /** @override */
  executeTask: function (options) { },

  /** @override */
  afterInstall: function (_options) {
    var options = JSON.parse(JSON.stringify(_options));

    log.info('sys-report', render(options.report));

    if (options.xt.adminpw) { // XXX is this the best proxy for the relevance of the success message?

      log.info('success', '#################################################');
      log.info('success', '#################################################');
      log.info('success', '#################################################');
      log.info('success', '                Congratulations!');
      log.info('success', '#################################################');
      log.info('success', '#################################################');
      log.info('success', '#################################################\n');

      log.info('success', 'You have installed an xTuple instance.\n');

      log.info('success', 'Chances are, the next thing you will want to do is to');
      log.info('success', 'log in using the xTuple Desktop Client. If you have not');
      log.info('success', 'downloaded it, you can find it at sourceforge.net');
      log.info('success', '(search for postbooks).\n');
      log.info('success', 'Make sure that you are using version %s of the client\n', options.xt.version);
      log.info('success', 'At the login window, please enter the following credentials.');
      log.info('success', 'Username: admin');
      log.info('success', 'Password: %s', options.xt.adminpw);
      log.info('success', 'Server: [see below]');
      log.info('success', 'Port: %d', options.pg.cluster.port);
      log.info('success', 'Database: %s\n', options.xt.database.list[0].dbname);

      log.info('success', 'The server will depend on where you have set up this instance');
      log.info('success', 'and where you are trying to access it from.\n');
      log.info('success', 'If you have set up the xTuple Server on a dedicated machine on');
      log.info('success', 'your network, you can access it from any other machine on the');
      log.info('success', 'network using the server\'s network address.\n');
      log.info('success', 'If you are running this in a Vagrant sandbox per our demo-setup');
      log.info('success', 'guidelines and want to connect to it from the host computer,');
      log.info('success', 'enter 192.168.33.10.');
    }

    if (options.sys.policy) {
      options.sys.policy.remotePassword = '<hidden>';
      options.sys.policy.userPassword = '<hidden>';
      options.sys.policy.adminpw = '<hidden>';
    }

    options.xt && options.xt.configdir && fs.writeFileSync(
      path.resolve(options.xt.configdir, 'install-results.json'),
      JSON.stringify(options, null, 2)
    );

    logfile.write(log, 'xtuple-server-report.log');
  }
});
