// resolve required node version with minimal fuss
require('fs').readFile('./package.json', function (err, data) {
  var ver = 'stable',
      pkg = JSON.parse(data);
  if (pkg && pkg.engines && pkg.engines.node) {
    ver = pkg.engines.node;
  }

  console.log(ver);
});
