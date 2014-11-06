var Hub = require('../lib');
var cluster = require('cluster');

var hub = new Hub();

if (cluster.isMaster) {
    cluster.fork();
    cluster.fork();

} else {
    hub.lock('foo', function (unlock) {
        console.log('locked foo in worker ' + cluster.worker.uniqueID);
        process.exit();
    });
}
