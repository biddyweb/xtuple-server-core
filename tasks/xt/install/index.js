var lib = require('xtuple-server-lib'),
  mkdirp = require('mkdirp'),
  _ = require('lodash'),
  n = require('n-api'),
  rimraf = require('rimraf'),
  proc = require('child_process'),
  fs = require('fs'),
  path = require('path');

var xtInstall = _.extend(exports, lib.task, /** @exports xtuple-server-xt-install */ {

  options: {
    ghuser: {
      optional: '[ghuser]',
      description: 'Github Account username',
      validate: function (value, options) {
        if (!_.isEmpty(value) && _.isEmpty(options.xt.ghpass)) {
          throw new Error('cannot use xt-ghuser without xt-ghpass');
        }
        return (value || '').trim();
      }
    },
    ghpass: {
      optional: '[ghpass]',
      description: 'Github Account password',
      validate: function (value, options) {
        if (!_.isEmpty(value) && _.isEmpty(options.xt.ghuser)) {
          throw new Error('cannot use xt-ghpass without xt-ghuser');
        }
        return (value || '').trim();
      }
    }
  },

  /** @override */
  beforeTask: function (options) {
    // add github.com to known_hosts file to avoid host authenticity prompt
    if (process.env.CI) {
      try {
        proc.spawnSync('ssh', [ '-o', 'StrictHostKeyChecking=no', 'git@github.com' ], { stdio: 'ignore' });
      }
      catch (e) {
        log.silly('xt-install', e.stack.split('\n'));
      }
    }

    if (fs.existsSync(options.xt.coredir)) {
      lib.util.resolveNodeVersion(options);
    }
  },

  /** @override */
  executeTask: function (options) {
    var protocol = process.env.CI ? 'git://github.com/' : 'https://github.com/';

    // FIXME this needs to be validated more thoroughly
    if (!_.isEmpty(options.xt.ghuser) && !_.isEmpty(options.xt.ghpass)) {
      protocol = 'https://' + options.xt.ghuser + ':' + options.xt.ghpass + '@github.com/';
    }

    _.each(lib.util.getRepositoryList(options), function (repo) {
      var clonePath   = path.resolve(options.xt.dist, repo),
          deployPath  = path.resolve(options.xt.userdist, repo),
          gitVersion  = options.xt.gitVersions || 'master';

      // preserve dev environments, create or replace non-dev environments
      if (fs.existsSync(clonePath) && options.planName !== 'install-dev') {
        rimraf.sync(clonePath);
      }

      if (! fs.existsSync(clonePath)) {
        log.http('xt-install', 'downloading', repo, gitVersion);
        lib.util.runCmd('git clone --recursive ' + protocol + 'xtuple/' + repo + '.git ' + clonePath,
                          { stdio: 'ignore' });
        lib.util.runCmd('cd ' + clonePath + ' && git checkout ' + gitVersion,
                          { stdio: 'ignore' });
      }
      lib.util.runCmd('cd ' + clonePath + ' && git submodule update --init --recursive');

      // always npm install to handle fresh checkouts and prior partial installs
      if (_.isEmpty(options.xt.nodeVersion)) {
        lib.util.resolveNodeVersion(options, clonePath);
      }
      n(options.xt.nodeVersion);
      log.http('xt-install', 'installing npm modules...');
      lib.util.runCmd([ 'cd', clonePath,
                        '&& /usr/local/bin/npm install --unsafe-perm' ],
                      { retry: 2 });

      if (!fs.existsSync(deployPath)) {
        mkdirp.sync(deployPath);
      }
      log.info('xt-install', 'copying files...');
      // copy main repo files to user's home directory
      lib.util.runCmd([ 'rsync -ar --exclude=.git', clonePath + '/*', deployPath ]);
      lib.util.runCmd([ 'chown -R', options.xt.name, deployPath ]);
      lib.util.runCmd('chmod -R u=rwx ' + deployPath);
    });
  },

  /** @override */
  afterTask: function (options) {
    proc.spawnSync([ 'chown -R', options.xt.name + ':' + options.xt.name, options.xt.userhome ]);
    n(process.version);
  }
});
