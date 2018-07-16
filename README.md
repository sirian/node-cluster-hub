node-cluster-hub
================

[![Greenkeeper badge](https://badges.greenkeeper.io/sirian/node-cluster-hub.svg)](https://greenkeeper.io/)

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
var hub = new Hub();

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
hub.sendToWorkers(message, data);
```

Examples:
* https://github.com/sirian/node-cluster-hub/blob/master/examples/index.js
* https://github.com/sirian/node-cluster-hub/blob/master/examples/broadcast.js

Requests between master and workers (with callback)
------
Same as simple messaging, but you can provide a callback 

```javascript
hub.requestMaster(message, data, callback);  //works from workers and master
hub.requestWorker(worker, message, data, callback);  // works from master
```

Example in "Getting Started" section, and here: https://github.com/sirian/node-cluster-hub/blob/master/examples/requests.js

Exclusive Locks
------

This module provide a way to get global exclusive lock between all processes (master and workers). If worker process dies while holding locked section - lock will be released automatically.

```javascript

// this method available in master and in workers
hub.lock(lockKey, function(unlock) {
    // exclusive lock here
   ...
   // to unlock - call unlock()
})
```

Example: https://github.com/sirian/node-cluster-hub/blob/master/examples/locks.js

Examples
------
More examples here: https://github.com/sirian/node-cluster-hub/tree/master/examples
