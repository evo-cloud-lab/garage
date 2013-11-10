var Class = require('js-class'),
    Logger = require('evo-elements').Logger;

var Cluster = Class({
    constructor: function (opts) {
        this.name = opts.name;
        this.basedir = opts.basedir;
        var adapterFactory = require('./adapters/' + (opts.adapter || 'generic'));
        this.adapter = adapterFactory(this, opts, new Logger('garage:cluster', '<' + this.name + '> '));
    },

    get info () {
        var info = this.adapter.info;
        info.name = this.name;
        info.basedir = this.basedir;
        return info;
    },

    reload: function (opts, callback) {
        this.adapter.reload(opts, callback);
    },

    nodes: function (callback) {
        var cluster = this;
        this.adapter.nodeIds(function (err, ids) {
            callback(err, err || ids.map(function (id) {
                return new Node(cluster, id);
            }));
        });
    }
});

module.exports = Cluster;