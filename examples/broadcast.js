var Hub = require('../lib');
var cluster = require('cluster');

var hub = new Hub();
if (cluster.isMaster) {
    var worker = cluster.fork();

    hub.on('master-to-master', function (data) {
        console.log('master-to-master received');
    });
    hub.on('worker-to-master', function (data) {
        console.log('worker-to-master received');
    });

    hub.sendToMaster('master-to-master', 1);
    hub.sendToWorker(worker, 'master-to-worker');
} else {
    hub.on('master-to-worker', function () {
        console.log('master-to-worker received');;
        process.exit();
    });

    hub.sendToMaster('worker-to-master', 2);

}
