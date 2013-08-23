var Hub = require('../lib');
var cluster = require('cluster');


var hub = new Hub(cluster);


if (cluster.isMaster) {
    hub.on('sum', function (data, sender, callback) {
        callback(data.a + data.b);
    });

    var worker = cluster.fork();

    hub.requestMaster('sum', {
        a: 5,
        b: 7
    }, function (sum) {
        console.log('Sum in master: ' + sum);
    });


    hub.requestWorker(worker, 'mult', {
        a: 5,
        b: 7
    }, function (sum) {
        console.log('Mult in master: ' + sum);
    });

} else {
    hub.on('mult', function (data, sender, callback) {
        callback(data.a * data.b);
    });

    hub.requestMaster('sum', {
        a: 1,
        b:2
    }, function (sum) {
        console.log('Sum in worker: ' + sum);
        process.exit();
    });
}
