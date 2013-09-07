var Class    = require('js-class'),
    path     = require('path'),
    elements = require('evo-elements'),
    Config = elements.Config,

    Cluster = require('./Cluster');

var ClusterManager = Class({
    constructor: function () {
        this.clusters = {};
    },

    add: function (dir, callback) {
        dir = path.resolve(dir);
        var conf = new Config();
        conf.parse(['-c', path.join(dir, 'cluster.yml')]);
        var name = conf.query('name', path.basename(dir));
        var opts = conf.opts;
        opts.basedir = dir;
        var cluster = new Cluster(name, opts);
        this.clusters[name] = cluster;
        process.nextTick(function () {
            callback(null, cluster);
        });
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
    }
});

module.exports = ClusterManager;