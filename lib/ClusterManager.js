var Class    = require('js-class'),
    path     = require('path'),
    async    = require('async'),
    elements = require('evo-elements'),
    Config = elements.Config,
    Try    = elements.Try,

    Cluster = require('./Cluster');

var ClusterManager = Class({
    constructor: function () {
        this.clusters = {};
    },

    add: function (dir, callback) {
        Try.tries(function () {
            var opts = this._loadClusterConf(dir);
            var cluster = this.clusters[opts.name];
            if (cluster) {
                cluster.reload(opts, function (err) {
                    callback(err, cluster);
                });
            } else {
                this.clusters[opts.name] = cluster = new Cluster(opts);
                callback(null, cluster);
            }
        }.bind(this), callback);
    },

    reload: function (callback) {
        async.each(Object.keys(this.clusters), function (name, next) {
            var cluster = this.clusters[name];
            if (cluster.basedir) {
                Try.tries(function () {
                    cluster.reload(this._loadClusterConf(cluster.basedir), next);
                }.bind(this), next);
            } else {
                next();
            }
        }.bind(this), callback);
    },

    list: function (callback) {
        var clusters = {};
        for (name in this.clusters) {
            clusters[name] = this.clusters[name].info;
        }
        process.nextTick(function () {
            callback(null, clusters);
        });
    },

    cluster: function (name) {
        return this.clusters[name];
    },

    _loadClusterConf: function (dir) {
        dir = path.resolve(dir);
        var conf = new Config();
        conf.parse(['-c', path.join(dir, 'cluster.yml')]);
        var name = conf.query('name', path.basename(dir));
        var opts = conf.opts;
        opts.basedir = dir;
        opts.name = name;
        return opts;
    }
});

module.exports = ClusterManager;