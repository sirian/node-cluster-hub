node-cluster-hub
================

A layer for communcation between master and worker processes

Installation
------
```
npm install cluster-hub
```

Getting started
------
```javascript
var Hub  = require('cluster-hub');
var cluster = require('cluster');
var hub = new Hub(cluster);

if (cluster.isMaster) {
    // in master process
    hub.on('sum', function (data, sender, callback) {
        callback(null, data.a + data.b);
    });

    var worker = cluster.fork();
} else {
    //in worker process
    hub.requestMaster('sum', {a: 1, b:2}, function (err, sum) {
        console.log('Sum in worker: ' + sum);
        process.exit();
    });
}
```

Simple message sending
------

```javascript
hub.sendToMaster(message, data);  //works from workers and master
hub.sendToWorker(worker, message, data);  // works from master
```

Broadcasting
------

```javascript
hub.sendToWorkers(message, data); //send message to all workers. Works from master and worker
```

Requests between master and workers (with callback)
------

See "Getting Started" section for example

Exclusive Locks
------

```javascript
hub.lock(lockKey, function(unlock) {
    // exclusive lock here
   ...
   // to unlock - call unlock()
})
```

Examples
------
More examples here: https://github.com/sirian/node-cluster-hub/tree/master/examples
