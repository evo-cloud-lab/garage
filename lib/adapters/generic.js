var Class = require('js-class'),
    _     = require('underscore'),
    path  = require('path'),
    exec  = require('child_process').exec;

function parseOutputHash(callback) {
    return function (err, stdout) {
        callback(err, err || (function () {
            var info = {};
            stdout.split("\n").forEach(function (line) {
                var tokens = line.split(':');
                var key = tokens[0].trim(), val = tokens[1];
                if (key.length > 0 && val != null) {
                    info[key] = val.trim();
                }
            });
            return info;
        })());
    };
}

var LxcAdapter = Class({
    constructor: function (cluster, opts) {
        this.cluster = cluster;
        this.basedir = opts.basedir;
        this.scriptdir = opts.scriptdir || path.join(__dirname, '..', '..', 'scripts', opts.script);
        this.env = opts.env || {};
    },

    get info () {
        return {
            adapter: 'script',
            scriptdir: this.scriptdir,
            env: this.env
        };
    },

    nodeIds: function (callback) {
        this._script('nodes', function (err, stdout) {
            callback(err, err || stdout.split("\n")
                                    .map(function (id) { return id.trim(); })
                                    .filter(function (id) { return id.length > 0; }));
        });
    },

    nodeStatus: function (id, callback) {
        this._script('status', id, parseOutputHash(callback));
    },

    startNode: function (id, options, callback) {
        var args = id.toString();
        options.clean && (args += ' clean');
        this._script('start', args, parseOutputHash(callback));
    },

    stopNode: function (id, options, callback) {
        var args = id.toString();
        options.clean && (args += ' clean');
        this._script('stop', args, parseOutputHash(callback));
    },

    _script: function (name, args, callback) {
        if (typeof(args) == 'function') {
            callback = args;
            args = '';
        }
        exec(path.join(this.scriptdir, name) + ' ' + args, {
            env: _.extend(_.clone(this.env), {
                CLUSTER_BASE: this.basedir,
                CLUSTER_NAME: this.cluster.name,
                CLUSTER_SCRIPTS_DIR: this.scriptdir
            })
        },callback);
    }
});

module.exports = function (cluster, opts) {
    return new LxcAdapter(cluster, opts);
}