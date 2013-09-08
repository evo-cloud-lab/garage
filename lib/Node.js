var Class = require('js-class'),
    _     = require('underscore'),
    exec  = require('child_process').exec;

var Node = Class({
    constructor: function (cluster, id) {
        this.cluster = cluster;
        this.id = id;
        this.name = cluster.name + '-' + id;
    },

    info: function (callback) {
        this.cluster.adapter.nodeStatus(this.id, callback);
        return this;
    },

    start: function (options, callback) {
        this.cluster.adapter.startNode(this.id, options, callback);
        return this;
    },

    stop: function (options, callback) {
        this.cluster.adapter.stopNode(this.id, options, callback);
        return this;
    }
});

module.exports = Node;