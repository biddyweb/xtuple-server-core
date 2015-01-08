var lib = require('xtuple-server-lib'),
  _ = require('lodash'),
  ip = require('ip'),
  format = require('string-format'),
  fs = require('fs'),
  path = require('path');
  
/**
 * Create a new nginx site
 */
var nginxSite = _.extend(exports, lib.task, /** @exports xtuple-server-nginx-site */ {

  options: {
    domain: {
      optional: '[domain]',
      description: 'The public domain name that will point to this web server',
      value: 'localhost'
    }
  },

  /**
   * Generate 'sitename' value and format the domain argument if necessary
   * @override
   */
  beforeInstall: function (options) {
    if (fs.existsSync('/etc/nginx/sites-enabled/default')) {
      fs.unlinkSync('/etc/nginx/sites-enabled/default');
      fs.unlinkSync('/etc/nginx/sites-available/default');
    }

    nginxSite.prepareNginxConf(options);

    options.nginx.sitename = lib.util.$(options);
    options.nginx.hostname = options.nginx.sitename + '.localhost';
    options.nginx.sitesAvailable = path.resolve('/etc/nginx/sites-available');
    options.nginx.sitesEnabled = path.resolve('/etc/nginx/sites-enabled');
    options.nginx.availableSite = path.resolve(options.nginx.sitesAvailable, options.nginx.sitename);
    options.nginx.enabledSite = path.resolve(options.nginx.sitesEnabled, options.nginx.sitename);

    options.nginx.httpport = 80;
    options.nginx.httpsport = 443;

    // nginx site template file path
    options.nginx.siteTemplateFile = path.resolve(__dirname, 'xtuple-site.template');

    if (options.nginx.domain === 'localhost') {
      options.nginx.domain = options.nginx.hostname;
    }
  },

  /** @override */
  beforeTask: function (options) {
    options.nginx.port = lib.util.getServerSSLPort(options);
    options.nginx.safeport = options.nginx.port + 32768;
  },

  /**
   * Generate and write nginx conf
   *  - proxy requests to the node server
   *  - auto-redirect http -> https
   *  - set up SSL
   *  - replace existing site, if any
   *  @override
   */
  executeTask: function (options) {
    if (fs.existsSync(options.nginx.enabledSite)) {
      fs.unlinkSync(options.nginx.availableSite);
      fs.unlinkSync(options.nginx.enabledSite);
    }
    exports.writeSiteConfig(options);
  },

  /** @override */
  afterTask: function (options) {
    lib.util.runCmd('service nginx reload');

    if (/^install/.test(options.planName)) {
      options.report['xTuple Instance'] = { 
        'IP Address': ip.address(),
        'Public Web Domain': options.nginx.domain,
        'Direct Web Port': options.nginx.safeport,
        'xTuple Username': 'admin',
        'xTuple Password': options.xt.adminpw
      };
    } 
  },

  writeSiteConfig: function (options) {
    // write nginx site config file
    fs.writeFileSync(
      options.nginx.availableSite,
      fs.readFileSync(options.nginx.siteTemplateFile).toString().format(options).trim()
    );

    lib.util.runCmd([ 'ln -s', options.nginx.availableSite, options.nginx.enabledSite ].join(' '));
  },

  /** @override */
  uninstall: function (options) {
    if (fs.existsSync(options.nginx.enabledSite)) {
      fs.unlinkSync(options.nginx.enabledSite);
      fs.unlinkSync(options.nginx.availableSite);

      lib.util.runCmd('service nginx reload');
    }
  },

  /**
   * The main nginx config file needs to be altered in some cases before an
   * install can proceed.
   */
  prepareNginxConf: function (options) {
    var file = '/etc/nginx/nginx.conf';
    var conf = fs.readFileSync(file).toString();
    var replaceSettings = {
      '# server_names_hash_bucket_size 64': 'server_names_hash_bucket_size 64'
    };

    var newConf = _.reduce(replaceSettings, function (resultConf, newSetting, oldSetting) {
      return resultConf.replace(oldSetting, newSetting);
    }, conf);

    if (conf == newConf) return;

    fs.writeFileSync(file, conf);
    lib.util.runCmd('service nginx reload');
  }
});
