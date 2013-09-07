var Class = require('js-class');

var Cluster = Class({
    constructor: function (name, opts) {
        this.name = name;
        var adapterFactory = require('./adapters/' + (opts.adapter || 'generic'));
        this.adapter = adapterFactory(this, opts);
    },

    get info () {
        var info = this.adapter.info;
        info.name = this.name;
        return info;
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