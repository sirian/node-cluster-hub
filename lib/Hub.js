module.exports = Hub;

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var crypto = require('crypto');
var async = require('async');

function Hub(cluster, messageKey) {
    this._cluster = cluster || require('cluster');
    this._initializedWorkers = {};
    this._setupListeners();
    this._messageKey = messageKey || 'cluster';

    this._locks = {};
    this._requests = {};

    EventEmitter.call(this);
}

util.inherits(Hub, EventEmitter);

Hub.prototype._setupListeners = function () {
    var hub = this;

    this.on('_hub_request', function (msg, worker) {
        hub._handleRequest(msg, worker, function () {
            var response = Array.prototype.slice.call(arguments);
            if (worker) {
                hub.sendToWorker(worker, msg.responseType, response);
            } else {
                hub.sendToMaster(msg.responseType, response);
            }
        });
    });

    if (this._cluster.isWorker) {
        this._cluster.worker.on('message', function (message) {
            if (null !== message && 'object' === typeof message && message._hub_key === hub._messageKey) {
                hub.emit(message.type, message.data, hub._cluster.worker);
            }
        });
    } else {
        this.eachWorker(function (worker) {
            this._initWorker(worker);
        });


        this._cluster.on('fork', function (worker) {
            hub._initWorker(worker);
        }).on('exit', function (worker) {
            hub._cancelRequests(worker);
            hub._releaseLocks(worker);
        });

        this.on('_hub_broadcast', function (data) {
            hub.eachWorker(function (worker) {
                if (worker.uniqueID !== data.workerId) {
                    hub.sendToWorker(worker, data.type, data.data);
                }
            });
        }).on('_hub_lock', this._doLock.bind(this))
        .on('_hub_unlock', this._doUnlock.bind(this));
    }
};

Hub.prototype.eachWorker = function (callback) {
    var workers = this._cluster.workers;
    for (var id in workers) {
        if (!workers.hasOwnProperty(id)) {
            continue;
        }
        if (false === callback.call(this, workers[id])) {
            return;
        }
    }
};

Hub.prototype._initWorker = function (worker) {
    if (this._initializedWorkers.hasOwnProperty(worker.uniqueID)) {
        return;
    }

    this._initializedWorkers[worker.uniqueID] = true;
    var hub = this;
    worker.on('message', function (message) {
        if (null !== message && 'object' === typeof message && message._hub_key === hub._messageKey) {
            hub.emit(message.type, message.data, worker);
        }
    });
};

Hub.prototype.sendToWorker = function (worker, type, data) {
    worker.send({type: type, data: data, _hub_key: this._messageKey});
};

Hub.prototype.sendToMaster = function (type, data) {
    if (this._cluster.isWorker) {
        this._cluster.worker.send({type: type, data: data, _hub_key: this._messageKey});
    } else {
        this.emit(type, data);
    }
};

Hub.prototype.sendToWorkers = function (type, data) {
    var hub = this;
    if (this._cluster.isMaster) {
        this.eachWorker(function (worker) {
            hub.sendToWorker(worker, type, data);
        });
    } else {
        this.sendToMaster('_hub_broadcast', {
            type: type,
            data: data,
            workerId: this._cluster.worker.uniqueID
        });
    }
};

Hub.prototype.requestMaster = function (type, data, callback) {
    this._doRequest(undefined, type, data, callback)
};

Hub.prototype.requestWorker = function (worker, type, data, callback) {
    if (this._cluster.isWorker) {
        throw new Error('Sending requests from worker to worker is not implemented');
    }

    this._doRequest(worker, type, data, callback)
};

Hub.prototype._doRequest = function (worker, type, data, callback) {
    var rnd = '_hub_request.' + crypto.randomBytes(32).toString('hex');


    if ('function' === typeof callback) {
        this.once(rnd, function (data) {
            callback.apply(null, data);
        });
    }

    if (worker) {
        if (!this._requests.hasOwnProperty(worker.uniqueID)) {
            this._requests[worker.uniqueID] = {};
        }
        this._requests[worker.uniqueID][rnd] = true;
    }

    var sendFunction = worker ? this.sendToWorker.bind(this, worker) : this.sendToMaster.bind(this);

    sendFunction('_hub_request', {
        type: type,
        data: data,
        responseType: rnd
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

Hub.prototype._doLock = function (data, sender, callback) {
    var key = data.key;
    if (!this._locks.hasOwnProperty(key)) {
        this._locks[key] = [];
    }

    this._locks[key].push({
        sender: sender,
        callback: callback
    });

    if (1 === this._locks[key].length) {
        callback();
    }
};

Hub.prototype._doUnlock = function (data, sender, callback) {
    var key = data.key;

    var q = this._locks[key];
    q.shift();

    if (q.length > 0) {
        var nextLock = q[0];
        nextLock.callback();
    } else {
        delete this._locks[key];
    }

    if ('function' === typeof callback) {
        callback();
    }
};

Hub.prototype._handleRequest = function (msg, sender, callback) {
    this.emit(msg.type, msg.data, sender, callback);
};

Hub.prototype._cancelRequests = function (worker) {
    var requests = this._requests[worker.uniqueID];

    for (var responseType in requests) {
        if (requests.hasOwnProperty(responseType)) {
            this.sendToMaster(responseType, [new Error('Worker died')]);
        }
    }
    delete this._requests[worker.uniqueID];
};

Hub.prototype._releaseLocks = function (worker) {
    for (var key in this._locks) {
        if (!this._locks.hasOwnProperty(key)) {
            continue;
        }
        var lock = this._locks[key][0];
        if (lock.sender === worker) {
            this._doUnlock({key: key}, worker);
        }
    }
};