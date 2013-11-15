var Class = require('js-class'),
    path  = require('path'),
    async = require('async'),
    elements = require('evo-elements'),
    Try    = elements.Try,
    Logger = elements.Logger,
    Container = require('evo-ambience').Container;

var ContainerCtl = Class({
    constructor: function (id, conf, logger) {
        this.logger = Logger.clone(logger, { prefix: logger.prefix + '<' + id + '> ' });
        (this.container = new Container(id, conf, this.logger))
            .on('ready', this.onReady.bind(this))
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
        if (!this.container.setState('running')) {
            this._complete();
        }
    },

    stop: function (callback) {
        this._setCallback(callback);
        if (!this.container.setState('offline')) {
            this._complete();
        }
    },

    onReady: function (state) {
        this.logger.notice('READY %s', state);
        this._complete();
    },

    onError: function (err) {
        this.logger.error(err);
        this._complete(err);
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
            if (container) {
                if (container.container.state == 'stopped') {
                    container.stop();
                    delete this._containers[id];
                } else if (container.container.state == 'offline') {
                    delete this._containers[id];
                }
            }
        }, this);
    }
});

module.exports = function (cluster, opts, logger) {
    return new AmbienceAdapter(cluster, opts, logger);
};
