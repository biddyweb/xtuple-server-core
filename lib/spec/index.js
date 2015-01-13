global.log = require('npmlog');
log.heading = 'xtuple-server-lib';
log.level = 'verbose';

var assert = require('assert'),
    fs     = require('fs'),
    lib    = require('../'),
    _      = require('lodash');

require('../pg-cli/spec');

describe('util', function () {

  describe('#getDatabaseName', function () {
    it('should sanitize a .dirgz database import', function () {
      var filename = 'a/b/c/foo.dirgz';
      var dbname = lib.util.getDatabaseName(filename, 'dev');

      assert.equal(dbname, 'foo_dev');
    });
    it('should sanitize a .backup database import', function () {
      var filename = 'a/b/c/foo.backup';
      var dbname = lib.util.getDatabaseName(filename, 'dev');

      assert.equal(dbname, 'foo_dev');
    });
    it('should lowercase', function () {
      var filename = 'demov470_ERP_pilot.backup';
      var dbname = lib.util.getDatabaseName(filename, 'pilot');

      assert.equal(dbname, 'demov470_erp_pilot');
    });
    it('should sanitize utter craziness', function () {
      var filename = 'a/b happy foo/c/foo--_ bar4.5.0.backup';
      var dbname = lib.util.getDatabaseName(filename, 'dev');

      assert.equal(dbname, 'foo_bar450_dev');
    });
  });

  describe('#getPassword', function () {
    it('should generate a base64 string', function () {
      var pw = lib.util.getPassword();
      assert.ok(/^[A-Za-z0-9+\/]+=*$/.test(pw));
    });
  });

  describe('#getRandom', function () {
    it('should generate a random hex value', function () {
      var hex = lib.util.getRandom(7);
      assert.ok(/^[A-Fa-f0-9]+$/.test(hex.trim()));
    });
  });

  describe('#runCmd', function () {
    var retryScript = '/tmp/runCmdTest.sh';

    it('should run a simple command', function () {
      var result = lib.util.runCmd('echo true');
      assert.equal(result.trim(), 'true');
    });
    it('should run a simple pipeline', function () {
      var result = lib.util.runCmd('echo true | wc -c');
      assert.equal(result.trim(), '5');
    });
    it('should handle an error from simple cmd', function () {
      // TODO: assert.throws(lib.util.runCmd('echotrue'), ...
      var result, err;
      try       { result = lib.util.runCmd('echotrue'); }
      catch (e) { err = e; }
      assert.ok(!result); // TODO: better assert for falsy?
      assert.ok(err.status != 0);
      assert.ok(err.stderr && err.stderr.toString());
      assert.ok(/not found/.test(err.stderr));
    });
    it('should ignore errors on request', function () {
      var result, err;
      try       { result = lib.util.runCmd('echotrue', { continue: true }); }
      catch (e) { err = e; }
      assert.ok(! err);
    });

    it('should not retry when asked on success', function () {
      var filename = '/tmp/runCmdTest.' + Date.now(),
          result;
      // create an empty file, then run a command that makes it grow
      lib.util.runCmd([ 'rm -f', filename, '&& touch', filename ]);
      result = lib.util.runCmd([ 'cat', filename, '|| ls /tmp >>', filename ],
                               { retry: 3 });

      assert.ok(! result);
      after(function () { try { fs.unlinkSync(filename); } catch (e) {} });
    });

    it('should retry on error when asked and eventually fail', function () {
      var result, err;
      try       { fs.unlinkSync(retryScript); }
      catch (e) { log.silly('ignoring', e.message); }
      try {
        result = lib.util.runCmd('bash ' + retryScript, { retry: 2 });
      } catch (e) { err = e; }
      assert.ok(! _.isEmpty(err));
    });
    it('should retry on error when asked and eventually succeed', function () {
      var result, err;
      try       { fs.unlinkSync(retryScript); }
      catch (e) { log.silly('ignoring', e.message); }
      try {
        result = lib.util.runCmd([ 'bash', retryScript, ';',
                                   'echo echo', retryScript, '>', retryScript ],
                                 { retry: 1 }
                                );
      } catch (e) { err = e; }
      assert.ok(_.isEmpty(err));
    });
    after(function () {
      log.info('after', 'removing ' + retryScript);
      try { fs.unlinkSync(retryScript); } catch (e) {}
    });

    it('should handle an error with no stderr', function () {
      var result, err;
      try       { result = lib.util.runCmd('false'); }
      catch (e) { err = e; }
      assert.ok(!result); // TODO: better assert for falsy?
      assert.ok(err.status != 0);
      assert.ok(! (err.stdout && err.stdout.toString()));
      assert.ok(! (err.stderr && err.stderr.toString()));
    });
    it('should allow retry and ignoring errors on request', function () {
      var result, err;
      try {
        result = lib.util.runCmd('echotrue', { continue: true, retry: 1 });
      } catch (e) {
        err = e;
      }
      assert.ok(! err);
    });
    it('should handle options properly', function () {
      var result = lib.util.runCmd('echo true', {stdio: 'ignore'});
      assert.ok(!result); // TODO: better assert for falsy?
    });
  });

  describe('$', function () {
    it('should properly distill options into an id', function () {
      assert.equal(lib.util.$({ xt: { name: 'tjwebb', version: '4.5.1' }, type: 'pilot' }), 'tjwebb-451-pilot');
      assert.equal(lib.util.$({ xt: { name: 'tjwebb', version: 'a38ed1fb' }, type: 'pilot' }), 'tjwebb-a38ed1fb-pilot');
    });
  });

});
