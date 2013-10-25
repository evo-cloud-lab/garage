/** @fileoverview
 * Container is the facet of an isolated environment
 * inside which an operating system is running.
 * The inner isolated environment can be supported by
 * a certain containment implementation, like LXC,
 * KVM etc.
 *
 * A container is always associated with a state:
 * {
 *      name: string [mandatory] - current state of interior
 *      info: object [optional] - must be present when in 'fault' state
 * }
 *      The value of 'name' should be one of
 *          'offline'   The container is not loaded
 *          'loading'   The container is being loaded
 *          'unloading' The container is being unloaded
 *          'stopped'   The interior is ready, but not started
 *          'starting'  The interior has been requested to start, and is in progress
 *          'running'   The interior is started, and is running
 *          'stopping'  The interior has been requested to stop, and is in progress
 *
 * Interior Abstraction
 *
 * An interior registered here is a factory function
 * which conforms to:
 *      function interiorFactory (id, config, monitorFn);
 * parameters:
 *      id          Unique identifier
 *      config      The configuration object
 *      monitorFn   The monitoring function to receive all events
 * return:
 *      the interior instance
 *
 * An interior instance must providing the following methods:
 *
 * load: function (opts); [Optional]
 *      Request to load the interior.
 *      This method can only be used when 'state.name' is 'offline'.
 *
 * unload: function (opts); [Optional]
 *      Request to unload (offline) the interior.
 *      This method can only be used when 'state.name' is 'stopped'
 *      If not implemented, the container automatically goes to 'offline' state.
 *
 * start: function (opts);
 *      Request to start the interior.
 *      This method can only be used when 'state.name' is 'stopped'.
 *
 * stop: function (opts);
 *      Request to stop the interior.
 *      This method can only be used when 'state.name' is one of:
 *          'starting', 'running', 'stopping'.
 *
 *      'opts' can contain following properties:
 *          force: boolean  When true, kill the interior immediately.
 *
 * status: function (opts); [Optional]
 *      Request detailed status from the interior asynchronously.
 *      This method can only be used when 'state.name' is one of:
 *          'stopped', 'starting', 'running', 'stopping'.
 *      The reported status object should be passed through 'monitorFn' and
 *      schema is interior specific or TO BE DEFINED.
 *
 * The 'monitorFn' can be used to report status or errors, it is defined as
 *      function monitorFn(event, object);
 *      'event' is defined as:
 *          'state': interior state name, should be one of 'offline', 'stopped', 'running'
 *          'status': status update, object is interior specific or TO BE DEFINED
 *          'error': error happens, object is an Error instance
 */

var Class    = require('js-class'),
    elements = require('evo-elements'),
    Config       = elements.Config,
    StateMachine = elements.StateMachine;

var INTERIOR_STATES = ['offline', 'stopped', 'running'];

var State = Class({
    constructor: function (container) {
        this.container = container;
    },

    process: function (transit, action) {
        switch (action) {
            case 'action':
                this._action.apply(this, [].slice.call(arguments, 2));
                break;
            case 'state':
                this._state.apply(this, [].slice.call(arguments, 2));
                break;
        }
    },

    transit: function () {
        this.container._states.transit.apply(this.container._states, arguments);
    },

    interiorInvoke: function (action, opts, fallback) {
        var fn = this.container.interior[action];
        if (typeof(fn) == 'function') {
            this.transit('action-' + action, opts);
            fn.call(this.container.interior, opts);
        } else if (fallback) {
            this.transit(fallback);
        } else {
            this._badAction(action, opts);
        }
    },

    dostatus: function (opts) {
        var fn = this.container.interior.status;
        if (typeof(fn) == 'function') {
            fn(opts);
        }
    },

    _action: function (name, opts) {
        var method = this['do' + name];
        if (typeof(method) == 'function') {
            method.call(this, opts);
        } else {
            this._badAction(name, [opts]);
        }
    },

    _state: function (state) {
        this.transit('state-' + state);
    },

    _badAction: function (name, opts) {
        var err = new Error('Invalid operation: ' + name);
        err.operation = {
            name: name,
            options: opts
        };
        throw err;
    }
}, {
    statics: {
        extend: function (prototype) {
            prototype || (prototype = {});
            prototype.constructor || (prototype.constructor = function () {
                State.prototype.constructor.apply(this, arguments);
            });
            return Class(State, prototype);
        }
    }
});

var OfflineState = State.extend({
    doload: function (opts) {
        this.interiorInvoke('load', opts, 'state-stopped');
    },

    dounload: function () { },
    dostatus: null
});

var LoadingState = State.extend({
    dounload: function (opts) {
        this.interiorInvoke('unload', opts, 'state-offline');
    },

    doload: function () { },
    dostatus: null
});

var UnloadingState = State.extend({
    dounload: function () { },
    dostatus: null
});

var StoppedState = State.extend({
    dounload: function (opts) {
        this.interiorInvoke('unload', opts, 'state-offline');
    },

    dostart: function (opts) {
        this.interiorInvoke('start', opts);
    },

    dostop: function () { }
});

var StartingState = State.extend({
    dostop: function (opts) {
        this.interiorInvoke('stop', opts);
    },

    dostart: function () { }
});

var RunningState = State.extend({
    dostop: function (opts) {
        this.interiorInvoke('stop', opts);
    },

    dostart: function () { }
});

var StoppingState = State.extend({
    dostop: function (opts) {
        opts && opts.force && this.interiorInvoke('stop', opts);
    }
});

var Container = Class(process.EventEmitter, {

    /** @constructor
     * @description Instantiate a new container instance
     *
     * @param {String} id   Identifier of this container
     * @param {String|object} conf  Container configuration
     *              - if it is a String, it is the path and
     *                name of configuration file
     *              - if it is an object, it is the configuration
     */
    constructor: function (id, conf) {
        this._id = id;

        var factory;
        if (typeof(conf) == 'function') {
            factory = conf;
        } else {
            typeof(conf) == 'string' && (conf = Config.loadFileSync(conf));
            if (typeof(conf) != 'object') {
                throw new Error('Invalid configuration');
            }

            var interiorFactory = Container.interiors[conf.interior || Container.defaultInterior];
            if (!interiorFactory) {
                throw new Error('Invalid interior ' + conf.interior);
            }

            factory = function (id, monitorFn) {
                return interiorFactory(id, conf, monitorFn);
            };
        }

        this._interior = factory(id, this._monitorEvent.bind(this));
        this._interiorState = 'offline';

        ['load', 'unload', 'start', 'stop', 'status'].forEach(function (action) {
            this[action] = function (opts) {
                this._states.process('action', action, opts);
                return this;
            }.bind(this);
        }, this);

        this._states = new StateMachine()
            .state('offline', new OfflineState(this))
                .when('state-stopped').to('stopped')
                .when('state-running').to('running')
                .when('state-offline').to('offline')
                .when('action-load').to('loading')
            .state('loading', new LoadingState(this))
                .when('state-stopped').to('stopped')
                .when('state-running').to('running')
                .when('state-offline').to('loading')
                .when('action-unloading').to('unloading')
            .state('unloading', new UnloadingState(this))
                .when('state-stopped').to('unloading')
                .when('state-running').to('running')    // state inconsistent, use interior state
                .when('state-offline').to('offline')
            .state('stopped', new StoppedState(this))
                .when('state-stopped').to('stopped')
                .when('state-running').to('running')
                .when('state-offline').to('offline')
                .when('action-start').to('starting')
                .when('action-unload').to('unloading')
            .state('running', new RunningState(this))
                .when('state-stopped').to('stopped')
                .when('state-running').to('running')
                .when('state-offline').to('offline')    // state inconsistent, use interior state
                .when('action-stop').to('stopping')
            .state('starting', new StartingState(this))
                .when('state-stopped').to('starting')
                .when('state-running').to('running')
                .when('state-offline').to('offline')    // state inconsistent, use interior state
                .when('action-stop').to('stopping')
            .state('stopping', new StoppingState(this))
                .when('state-stopped').to('stopped')
                .when('state-running').to('stopping')
                .when('state-offline').to('offline')    // state inconsistent, use interior state
                .when('action-stop').to('stopping')
            .init('offline')
            .on('transit', this._stateTransit.bind(this))
            .start();
    },

    /** @field
     * @description Container identifier
     * This is read-only
     */
    get id () {
        return this._id;
    },

    /** @field
     * @description Interior
     */
    get interior () {
        return this._interior;
    },

    /** @field
     * @description Current state
     */
    get state () {
        return this._states.currentName;
    },

    /** @field
     * @description Interior state
     */
    get interiorState () {
        return this._interiorState;
    },

    /** @field
     * @description Recent status
     */
    get recentStatus() {
        return this._status;
    },

    // Internals

    _monitorEvent: function (event, data) {
        switch (event) {
            case 'error':
                this.emit('error', data);
                break;
            case 'state':
                if (typeof(data) == 'string' && INTERIOR_STATES.indexOf(data) >= 0) {
                    this._interiorState = data;
                    this._states.process('state', data);
                }
                break;
            case 'status':
                this._status = data;
                this.emit('status', data);
                break;
        }
    },

    _stateTransit: function (curr, next) {
        this.emit('state', next, curr);
    }
}, {
    statics: {
        /** @static
         * @description All supported interiors are registered here
         */
        interiors: {

        },

        defaultInterior: 'external'
    }
});

module.exports = Container;
