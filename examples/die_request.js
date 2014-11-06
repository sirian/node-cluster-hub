var Hub = require('../lib');
var cluster = require('cluster');


var hub = new Hub();


if (cluster.isMaster) {

    var worker = cluster.fork();

    hub.requestWorker(worker, 'test', {}, function (err, sum) {
        console.log(arguments);
    });

} else {

    hub.on('test', function (data, sender, callback) {
        setTimeout(function () {

            process.exit()
        }, 100);
    });
}
