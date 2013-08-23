var Hub = require('../lib');
var cluster = require('cluster');

var hub = new Hub(cluster);


if (cluster.isMaster) {
    var worker = cluster.fork();

    hub.lock('foo', function (unlock) {
        console.log('foo lock in master');
        setTimeout(unlock, 1000);
    });


} else {
    hub.lock('foo', function (unlock) {
        console.log('foo lock in worker 1');
        setTimeout(unlock, 500);
    });

    hub.lock('bar', function (unlock) {
        console.log('bar lock in worker');
        unlock();
    })

    hub.lock('foo', function (unlock) {
        console.log('foo lock in worker 2');
        unlock();
        process.exit();
    })
}
