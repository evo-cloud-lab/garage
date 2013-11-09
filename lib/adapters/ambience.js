var Class = require('js-class'),
    path  = require('path'),
    async = require('async'),
    Try   = require('evo-elements').Try,
    Trace = require('evo-elements').Trace,
    Container = require('evo-ambience').Container;

var ContainerCtl = Class({
    constructor: function (id, conf, logger) {
        this.logger = Trace.logger(logger.name + ':' + id);
        this._expects = {};
        (this.container = new Container(id, conf, this.logger))
            .on('state', this.onState.bind(this))
            .on('error', this.onError.bind(this))
        ;
    },

    get status () {
        return {
            state: this.container.state.toUpperCase(),
            status: this.container.recentStatus
        };
    },

    start: function (callback) {
        this._setCallback(callback);
        switch (this.container.state) {
            case 'offline':
                this._expects = {
                    loading: function () { },
                    stopped: function () { this._start(); },
                    running: function () { this._complete(); }
                };
                this.container.load();
                break;
            case 'stopped':
                this._start();
                break;
            case 'running':
                this._complete();
                break;
            case 'starting':
            case 'loading':
                break;
            default:
                this._complete(new Error('Invalid state: ' + this.container.state));
                break;
        }
    },

    stop: function (callback) {
        this._setCallback(callback);
        switch (this.container.state) {
            case 'offline':
            case 'unloading':
                this._complete();
                break;
            case 'stopped':
                this._unload();
                break;
            case 'stopping':
                break;
            case 'running':
                this._stop();
                break;
            case 'starting':
                this._expects = {
                    running: function () { this._stop(); },
                    stopping: function () { },
                    stopped: function () { this._unload(); }
                };
                this.container.stop();
                break;
            case 'loading':
                this.container.unload();
                this._complete();
                break;
        }
    },

    onState: function (state) {
        var action = this._expects[state];
        if (action) {
            this.logger.debug('Expected state: ' + state);
            action.call(this);
        } else {
            this.logger.debug('Unexpected state: ' + state);
            this._complete(new Error('Unexpected state: ' + state));
        }
    },

    onError: function (err) {
        this.logger.error(err);
    },

    _start: function () {
        this._expects = {
            starting: function () { },
            running: function () { this._complete(); }
        };
        this.container.start();
    },

    _stop: function () {
        this._expects = {
            stopping: function () { },
            stopped: function () { this._unload(); }
        };
        this.container.stop();
    },

    _unload: function () {
        this._complete();
        this.container.unload();
    },

    _setCallback: function (callback) {
        var old = this._callback;
        this._callback = callback;
        if (old) {
            this.logger.error('Callback overrun');
            old(new Error('Overrun'));
        }
    },

    _complete: function (err) {
        var callback = this._callback;
        delete this._callback;
        this._expects = {};
        callback && callback(err);
    }
});

var AmbienceAdapter = Class({
    constructor: function (cluster, opts, logger) {
        this.cluster = cluster;
        this.logger = logger;
        this._containers = {};
        this._load(opts);
    },

    get info () {
        return {
            adapter: 'ambience',
            workdir: this._opts.workdir
        };
    },

    reload: function (opts, callback) {
        this._load(opts);
        callback();
    },

    nodeIds: function (callback) {
        callback(null, Object.keys(this._containers));
    },

    nodeStatus: function (id, callback) {
        var container = this._containers[id];
        callback(null, container ? container.status : { state: 'UNPROVISIONED' });
    },

    startNode: function (id, options, callback) {
        var container = this._containers[id];
        Try.tries(function () {
            if (!container) {
                container = this._containers[id] = new ContainerCtl(id, this._opts, this.logger);
            }
            container.start(callback);
        }.bind(this), callback);
    },

    stopNode: function (id, options, callback) {
        var container = this._containers[id];
        container ? container.stop(callback) : callback();
    },

    _load: function (opts) {
        this._opts = opts;
        var workdir = opts.workdir || '';
        this._opts.workdir = path.resolve(opts.basedir, workdir);
        Object.keys(this._containers).forEach(function (id) {
            var container = this._containers[id];
            if (container && container.container.state == 'offline') {
                delete this._containers[id];
            }
        }, this);
    }
});

module.exports = function (cluster, opts, logger) {
    return new AmbienceAdapter(cluster, opts, logger);
};
