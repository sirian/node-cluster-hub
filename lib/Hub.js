module.exports = Hub;

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var crypto = require('crypto');
var async = require('async');
var cluster = require('cluster');

function Hub(messageKey) {
    this.initializedWorkers = {};
    this.setupListeners();
    this.messageKey = messageKey || 'cluster';

    this.locks = {};
    this.requests = {};

    EventEmitter.call(this);
}

util.inherits(Hub, EventEmitter);

Hub.prototype.setupListeners = function () {
    var hub = this;

    this.on('_hub_request', function (msg, worker) {
        hub.handleRequest(msg, worker, function () {
            var response = Array.prototype.slice.call(arguments);
            if (worker) {
                hub.sendToWorker(worker, '_hub_response', {
                    id: msg.id,
                    response: response
                });
            } else {
                hub.sendToMaster('_hub_response', {
                    id: msg.id,
                    response: response
                });
            }
        });
    }).on('_hub_response', function (msg, worker) {
        hub.handleResponse(msg.id, msg.response);
    });


    if (cluster.isWorker) {
        process.on('message', function (message) {
            if (null !== message && 'object' === typeof message && message.hub === hub.messageKey) {
                hub.emit(message.type, message.data, cluster.worker);
            }
        });
    } else {
        this.eachWorker(function (worker) {
            this.initWorker(worker);
        });


        cluster.on('fork', function (worker) {
            hub.initWorker(worker);
        }).on('exit', function (worker) {
            hub.cancelRequests(worker);
            hub.releaseLocks(worker);
        });

        this.on('_hub_broadcast', function (data) {
            hub.eachWorker(function (worker) {
                if (worker.id !== data.workerId) {
                    hub.sendToWorker(worker, data.type, data.data);
                }
            });
        }).on('_hub_lock', this.doLock.bind(this))
        .on('_hub_unlock', this.doUnlock.bind(this));
    }
};

Hub.prototype.getRandomWorker = function () {
    var ids = Object.keys(cluster.workers);
    if (!ids.length) {
        return null;
    }

    return cluster.workers[ids[Math.floor(Math.random() * ids.length)]]
};

Hub.prototype.eachWorker = function (callback) {
    var workers = cluster.workers;
    for (var id in workers) {
        if (!workers.hasOwnProperty(id)) {
            continue;
        }
        if (false === callback.call(this, workers[id])) {
            return;
        }
    }
};

Hub.prototype.initWorker = function (worker) {
    if (this.initializedWorkers.hasOwnProperty(worker.id)) {
        return;
    }

    this.initializedWorkers[worker.id] = true;

    var hub = this;
    worker.on('message', function (message) {
        if (null !== message && 'object' === typeof message && message.hub === hub.messageKey) {
            hub.emit(message.type, message.data, worker);
        }
    });
};

Hub.prototype.sendToWorker = function (worker, type, data) {
    worker.send({type: type, data: data, hub: this.messageKey});
};

Hub.prototype.sendToRandomWorker = function (type, data) {
    var worker = this.getRandomWorker();
    if (worker) {
        this.sendToWorker(worker, type, data);
        return true;
    }
    return false;
};

Hub.prototype.sendToMaster = function (type, data) {
    if (cluster.isWorker) {
        cluster.worker.send({type: type, data: data, hub: this.messageKey});
    } else {
        this.emit(type, data);
    }
};

Hub.prototype.sendToWorkers = function (type, data) {
    var hub = this;
    if (cluster.isMaster) {
        this.eachWorker(function (worker) {
            hub.sendToWorker(worker, type, data);
        });
    } else {
        this.sendToMaster('_hub_broadcast', {
            type: type,
            data: data,
            workerId: cluster.worker.id
        });
    }
};

Hub.prototype.requestMaster = function (type, data, callback) {
    this.doRequest(undefined, type, data, callback)
};

Hub.prototype.requestWorker = function (worker, type, data, callback) {
    if (cluster.isWorker) {
        throw new Error('Sending requests from worker to worker is not implemented');
    }

    this.doRequest(worker, type, data, callback)
};

Hub.prototype.requestAllWorkers = function (type, data, callback) {
    var responses = {};
    var hub = this;
    var total = 0;
    var responseCount = 0;

    this.eachWorker(function (worker) {
        total++;

        hub.requestWorker(worker, type, data, function () {
            responses[worker.id] = Array.prototype.slice.call(arguments);
            responseCount++;
            if (responseCount === total) {
                callback(null, responses);
            }
        });
    });
    if (total === 0) {
        callback(null, responses);
    }
};

Hub.prototype.requestRandomWorker = function (type, data, callback) {
    var worker = this.getRandomWorker();
    if (!worker) {
        callback(new Error('No workers'));
        return;
    }

    this.requestWorker(worker, type, data, callback)
};

Hub.prototype.doRequest = function (worker, type, data, callback) {

    var id = crypto.randomBytes(32).toString('hex');



    var self = this;
    if ('function' === typeof callback) {
        this.requests[id] = {
            worker: worker,
            callback: function (data) {
                delete self.requests[id];
                callback.apply(null, data);
            }
        };
    }

    var sendFunction = worker ? this.sendToWorker.bind(this, worker) : this.sendToMaster.bind(this);

    sendFunction('_hub_request', {
        type: type,
        data: data,
        id: id
    })
};

Hub.prototype.lock = function (key, callback) {
    var params = {
        key: key
    };
    var hub = this;

    this.requestMaster('_hub_lock', params, function () {
        var unlocked = false;

        var unlockFunction = function (callback) {
            if (unlocked) {
                throw new Error('Lock already unlocked');
                return;
            }
            unlocked = true;
            hub.requestMaster('_hub_unlock', params, callback);
        };

        callback.call(hub, unlockFunction);
    });
};

Hub.prototype.doLock = function (data, sender, callback) {
    var key = data.key;
    if (!this.locks.hasOwnProperty(key)) {
        this.locks[key] = [];
    }

    this.locks[key].push({
        sender: sender,
        callback: callback
    });

    if (1 === this.locks[key].length) {
        callback();
    }
};

Hub.prototype.doUnlock = function (data, sender, callback) {
    var key = data.key;

    var q = this.locks[key];
    q.shift();

    if (q.length > 0) {
        var nextLock = q[0];
        nextLock.callback();
    } else {
        delete this.locks[key];
    }

    if ('function' === typeof callback) {
        callback();
    }
};

Hub.prototype.handleRequest = function (msg, sender, callback) {
    this.emit(msg.type, msg.data, sender, callback);
};

Hub.prototype.handleResponse = function (id, result) {
    if (!this.requests.hasOwnProperty(id)) {
        return;
    }
    var request = this.requests[id];
    delete this.requests[id];
    request.callback.call(null, result);
};

Hub.prototype.cancelRequests = function (worker) {
    for (var id in this.requests) {
        if (!this.requests.hasOwnProperty(id)) {
            continue;
        }

        var req = this.requests[id];
        if (req.worker && req.worker.id === worker.id) {
            this.handleResponse(id, [new Error('Worker died')])
        }
    }
};

Hub.prototype.releaseLocks = function (worker) {
    for (var key in this.locks) {
        if (!this.locks.hasOwnProperty(key)) {
            continue;
        }
        var lock = this.locks[key][0];
        if (lock.sender === worker) {
            this.doUnlock({key: key}, worker);
        }
    }
};
