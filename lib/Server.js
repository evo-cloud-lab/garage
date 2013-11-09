var Class = require('js-class'),
    async = require('async'),
    express = require('express');

    ClusterManager = require('./ClusterManager'),
    Node = require('./Node');

function expandIds(requestIds) {
    var ids = [];
    if (Array.isArray(requestIds)) {
        for (var i in requestIds) {
            var range = requestIds[i].split('-');
            if (range.length == 2) {
                for (var id = parseInt(range[0]); id <= parseInt(range[1]); id ++) {
                    ids.push(id.toString());
                }
            } else {
                ids.push(requestIds[i]);
            }
        }
    }
    return ids;
}

var Server = Class({
    constructor: function (version, opts) {
        this.version = version;
        this.manager = new ClusterManager();

        this.app = express();
        this.app.use(express.logger());
        this.app.use(express.json());
        this.app.use(express.urlencoded());
        this.app.use(this.app.router);

        this.app.get('/info', this.info.bind(this));
        this.app.post('/shutdown', this.shutdown.bind(this));

        var apiPrefix = '/v' + version.api.split('.')[0];
        this.app.param('cluster', this.paramCluster.bind(this));
        this.app.get (apiPrefix + '/clusters', this.getClusters.bind(this));
        this.app.get (apiPrefix + '/clusters/:cluster/nodes', this.getClusterNodes.bind(this));
        this.app.get (apiPrefix + '/clusters/:cluster/nodes/:node', this.getClusterNode.bind(this));
        this.app.post(apiPrefix + '/clusters', this.addClusters.bind(this));
        this.app.post(apiPrefix + '/clusters/reload', this.reloadClusters.bind(this));
        this.app.post(apiPrefix + '/clusters/:cluster/nodes/:node/start', this.startNode.bind(this));
        this.app.post(apiPrefix + '/clusters/:cluster/nodes/:node/stop', this.stopNode.bind(this));
        this.app.post(apiPrefix + '/clusters/:cluster/start', this.startCluster.bind(this));
        this.app.post(apiPrefix + '/clusters/:cluster/stop', this.stopCluster.bind(this));

        this.port = opts.port || process.env.PORT || 3030;
        this.address = opts.address || process.env.ADDRESS || '127.0.0.1';

        if (opts.clusters) {
            this.preloadClusters = opts.clusters;
            Array.isArray(this.preloadClusters) || (this.preloadClusters = [this.preloadClusters]);
        }
    },

    start: function (callback) {
        var preload = this.preloadClusters;
        var manager = this.manager;
        async.series([
            function (next) {
                preload ? async.each(preload, function (dir, next) {
                    manager.add(dir, next);
                }, next) : next();
            },
            function (next) {
                this.app.listen(this.port, this.address, next);
            }.bind(this)
        ], callback);
    },

    paramCluster: function (req, res, next, id) {
        req.cluster = this.manager.cluster(id);
        req.cluster ? next() : (function () { this.error(res, 404, new Error('Cluster not found')); }.bind(this))();
    },

    getClusters: function (req, res) {
        var clusters = {};
        for (var name in this.manager.clusters) {
            clusters[name] = this.manager.clusters[name].info;
        }
        this.result(res, clusters);
    },

    getClusterNodes: function (req, res) {
        async.waterfall([
            function (next) {
                req.cluster.nodes(next);
            },
            function (nodes, next) {
                var status = {};
                async.each(nodes, function (node, next) {
                    node.info(function (err, info) {
                        err || (status[node.id] = info);
                        next(err);
                    });
                }, function (err) {
                    next(err, status);
                });
            }
        ], function (err, status) {
            err ? this.error(res, 500, err) : this.result(res, status);
        }.bind(this));
    },

    getClusterNode: function (req, res) {
        var node = new Node(req.cluster, req.params.node);
        node.info(function (err, info) {
            err ? this.error(res, 404, err) : this.result(res, info);
        }.bind(this));
    },

    addClusters: function (req, res) {
        var paths = req.body.paths;
        if (!Array.isArray(paths)) {
            this.error(res, 400, new Error('Expects a list of PATHs'));
        } else {
            async.map(paths, function (dir, next) {
                this.manager.add(dir, next);
            }.bind(this),
            function (err, clusters) {
                err ? this.error(res, 500, err) : this.result(res, clusters.map(function (cluster) { return cluster.info; }), 201);
            }.bind(this));
        }
    },

    reloadClusters: function (req, res) {
        this.manager.reload(function (err) {
            err ? this.error(res, 500, err) : this.result(res);
        }.bind(this));
    },

    startNode: function (req, res) {
        new Node(req.cluster, req.params.node).start(req.body.options || {}, function (err) {
            err ? this.error(res, 500, err) : this.result(res);
        }.bind(this));
    },

    stopNode: function (req, res) {
        new Node(req.cluster, req.params.node).stop(req.body.options || {}, function (err) {
            err ? this.error(res, 500, err) : this.result(res);
        }.bind(this));
    },

    startCluster: function (req, res) {
        var requestIds = req.body.ids;
        var options = req.body.options || {};
        if (Array.isArray(requestIds)) {
            var ids = expandIds(requestIds);
            async.each(ids, function (id, next) {
                new Node(req.cluster, id).start(options, next);
            }, function (err) {
                err ? this.error(res, 500, err) : this.result(res);
            }.bind(this));
        } else {
            this.error(res, 400, new Error('Bad request'));
        }
    },

    stopCluster: function (req, res) {
        var options = req.body.options || {};
        async.waterfall([
            function (next) {
                var requestIds = req.body.ids;
                if (Array.isArray(requestIds)) {
                    next(null, expandIds(requestIds).map(function (id) {
                            return new Node(req.cluster, id);
                        })
                    );
                } else {
                    req.cluster.nodes(next);
                }
            },
            function (nodes, next) {
                async.each(nodes, function (node, next) {
                    node.stop(options, next);
                }, next);
            }
        ], function (err) {
            err ? this.error(res, 500, err) : this.result(res);
        }.bind(this));
    },

    info: function (req, res) {
        this.result(res, this.version);
    },

    shutdown: function (req, res) {
        this.result(res);
        process.exit(0);
    },

    error: function (res, code, err) {
        res.set('Content-Type', 'application/json');
        var payload = JSON.stringify({ message: err.message });
        res.set('Content-Length', payload.length);
        res.send(code, payload);
    },

    result: function (res, object, code) {
        res.set('Content-Type', 'application/json');
        var payload = object && JSON.stringify(object);
        res.set('Content-Length', payload ? payload.length : 0);
        res.send(code || (payload ? 200 : 204), payload);
    }
});

module.exports = Server;
