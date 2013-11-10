#!/usr/bin/env node

var path    = require('path'),
    async   = require('async'),
    nomnom  = require('nomnom'),
    request = require('request'),
    colors  = require('colors'),

    V = require('./version');

var API_PREFIX = '/v' + V.api.split('.')[0];

function apiUrl(parser, path) {
    return parser.server + API_PREFIX + path;
}

function apiCompatible(api) {
    var myApi = V.api.split('.').map(function (n) { return parseInt(n); });
    if (typeof(api) != 'string') {
        return false;
    }
    var vers = api.split('.');
    if (myApi[0] != parseInt(vers[0])) {
        return false;
    }
    var rev = parseInt(vers[1]);
    if (isNaN(rev) || myApi[1] > rev) {
        return false;
    }

    return true;
}

function fatal(err) {
    console.log(err.message.red);
    console.log('FAIL'.red);
    process.exit(1);
}

function complete(err) {
    err ? fatal(err) : console.log('OK'.green);
}

function rest(path, opts, callback) {
    if (typeof(opts) == 'function') {
        callback = opts;
        opts = {
            method: 'GET'
        }
    } else if (typeof(opts) == 'string') {
        opts = {
            method: opts
        };
    }
    var requestOptions = {
        url: path,
        method: opts.method,
        json: true,
        headers: {}
    };
    if (opts.data) {
        requestOptions.body = opts.data;
        opts.method || (requestOptions.method = 'POST');
    } else if (opts.method == 'POST' || opts.method == 'PUT') {
        requestOptions.headers['Content-Length'] = '0';
    }

    request(requestOptions, function (err, response, body) {
        try {
            if (err) {
                throw err;
            } else if (response.statusCode >= 400) {
                var message = body && body.message && body.message.toString();
                message && console.log(message.red);
                var stack = body && body.stack && body.stack.toString();
                stack && console.log(stack.grey);
                throw new Error('Request failed ' + response.statusCode);
            } else {
                done = function (err) {
                    (err || !opts.next) && complete(err);
                };
                if (callback) {
                    if (callback.length > 1) {
                        callback(body, done);
                    } else {
                        callback(body);
                        done();
                    }
                } else {
                    done();
                }
            }
        } catch (e) {
            fatal(e);
        }
    });
}

function align(text, length) {
    if (text.length > length) {
        return text.substr(0, length - 3) + '...';
    } else {
        var pads = '';
        for (var i = text.length; i < length; i ++) {
            pads += ' ';
        }
        return text + pads;
    }
}

var ALIGN = 18, PREFIX='    ';

function printPair(key, val, prefix) {
    if (typeof(val) == 'object') {
        console.log(align(prefix + key, ALIGN).white);
        for (var k in val) {
            printPair(k, val[k], prefix + PREFIX);
        }
    } else if (Array.isArray(val)) {
        console.log(align(prefix + key, ALIGN).white);
        for (var n in val) {
            printPair('-', val[n], prefix + PREFIX);
        }
    } else {
        console.log(align(prefix + key, ALIGN).white + ' ' + val.toString().grey);
    }
}

function printObject(object, prefix) {
    for (var key in object) {
        printPair(key, object[key], prefix);
    }
}

function printCluster(cluster) {
    console.log(cluster.name.yellow.bold);
    for (var key in cluster) {
        if (key != 'name') {
            printPair(key, cluster[key], PREFIX);
        }
    }
}

var STATES = {
    STARTING:       'yellow',
    RUNNING:        'green',
    STOPPING:       'yellow',
    STOPPED:        'grey',
    FREEZING:       'cyan',
    FROZEN:         'blue',
    ABORTING:       'red',
    UNPROVISIONED:  'grey'
};

function renderState(state) {
    var color = STATES[state];
    return color ? state[color] : state.grey;
}

function printNode(name, status, prefix, alignment) {
    console.log(prefix + name.yellow.bold);
    prefix += PREFIX;
    for (var key in status) {
        if (key == 'state') {
            console.log(align(prefix + key, alignment).cyan + ' ' + renderState(status[key]));
        } else {
            console.log(align(prefix + key, alignment).white + ' ' + status[key].toString().grey);
        }
    }
}

function printNodes(cluster, nodes, prefix) {
    var align = prefix ? prefix.length + ALIGN : ALIGN;
    prefix || (prefix = '');
    for (var id in nodes) {
        printNode(cluster + '-' + id, nodes[id], prefix, align);
    }
    Object.keys(nodes).length == 0 && console.log(prefix + 'No nodes provisioned'.grey);
}

nomnom.script('garage')
    .options({
        server: {
            abbr: 's',
            metavar: 'URL',
            help: 'Server URL',
            default: 'http://localhost:3030'
        },
        version: {
            abbr: 'v',
            flag: true,
            help: 'Display CLI version',
            callback: function () {
                return V.name + ' CLI v' + V.version + ' (api ' + V.api + ')';
            }
        }
    });

nomnom.command('info')
    .help('Display Server and CLI information')
    .callback(function (opts) {
        console.log((V.name + ' CLI').yellow.bold);
        printObject(V, PREFIX);
        if (opts.server) {
            rest(opts.server + '/info', function (data) {
                console.log("\n" + (V.name + ' Server').yellow.bold);
                printObject(data, PREFIX);
                apiCompatible(data.api) || console.log('API incompatible!'.red);
            });
        }
    });

nomnom.command('clusters')
    .help('List all clusters')
    .callback(function (opts) {
        rest(apiUrl(opts, '/clusters'), function (data) {
            for (var name in data) {
                printCluster(data[name]);
            }
            Object.keys(data).length == 0 && console.log('No clusters available!'.grey);
        });
    });

nomnom.command('reload')
    .help('Reload all cluster configurations')
    .callback(function (opts) {
        rest(apiUrl(opts, '/clusters/reload'), { method: 'POST' });
    });

nomnom.command('add-clusters')
        .option('PATH', {
            position: 1,
            required: true,
            list: true,
            type: 'string',
            help: 'The directory with cluster.yml and will contain cluster files'
        })
    .help('Register a new cluster')
    .callback(function (opts) {
        var paths = opts.PATH.map(function (dir) { return path.resolve(dir); });
        rest(apiUrl(opts, '/clusters'), { data: { paths: paths } }, function (data) {
            Array.isArray(data) && data.forEach(printCluster);
        });
    });

nomnom.command('nodes')
        .option('CLUSTER', {
            position: 1,
            required: false,
            type: 'string',
            help: 'Name of the cluster'
        })
    .help('List all nodes in CLUSTER')
    .callback(function (opts) {
        if (opts.CLUSTER) {
            rest(apiUrl(opts, '/clusters/' + opts.CLUSTER + '/nodes'), function (data) {
                printNodes(opts.CLUSTER, data);
            });
        } else {
            async.waterfall([
                function (next) {
                    rest(apiUrl(opts, '/clusters'), { next: next }, function (data) {
                        next(null, data);
                    });
                },
                function (clusters, next) {
                    async.each(Object.keys(clusters), function (name, next) {
                        rest(apiUrl(opts, '/clusters/' + name + '/nodes'), { next: next }, function (data) {
                            console.log(name.yellow.underline);
                            printNodes(name, data, PREFIX);
                            next();
                        });
                    }, next);
                }
            ], complete);
        }
    });

nomnom.command('node')
        .option('CLUSTER', {
            position: 1,
            required: true,
            type: 'string',
            help: 'Name of the cluster'
        })
        .option('ID', {
            position: 2,
            required: true,
            type: 'string',
            help: 'ID of node'
        })
    .help('Show node details')
    .callback(function (opts) {
        rest(apiUrl(opts, '/clusters/' + opts.CLUSTER + '/nodes/' + opts.ID), function (data) {
            printNode(opts.ID, data, '', ALIGN);
        });
    });

nomnom.command('start')
        .option('CLUSTER', {
            position: 1,
            required: true,
            type: 'string',
            help: 'Name of the cluster'
        })
        .option('IDLIST', {
            position: 2,
            required: true,
            list: true,
            type: 'string',
            help: 'List of IDs of nodes to be started'
        })
        .option('clean', {
            flag: true,
            help: 'Remove all changed data before starting the node'
        })
    .help('Start nodes')
    .callback(function (opts) {
        var data = { ids: opts.IDLIST, options: {} };
        opts.clean && (data.options.clean = true);
        rest(apiUrl(opts, '/clusters/' + opts.CLUSTER + '/start'), { data: data });
    });

nomnom.command('stop')
        .option('CLUSTER', {
            position: 1,
            required: true,
            type: 'string',
            help: 'Name of the cluster'
        })
        .option('IDLIST', {
            position: 2,
            required: false,
            list: true,
            type: 'string',
            help: 'List of IDs of nodes to be stopped, or all if not specified'
        })
        .option('clean', {
            flag: true,
            help: 'Remove all changed data on the node'
        })
    .help('Stop nodes')
    .callback(function (opts) {
        var data = { options: {} };
        opts.IDLIST && opts.IDLIST.length > 0 && (data.ids = opts.IDLIST);
        opts.clean && (data.options.clean = true);
        rest(apiUrl(opts, '/clusters/' + opts.CLUSTER + '/stop'), { data: data });
    });

nomnom.command('shutdown')
    .help('Shutdown Garage server')
    .callback(function (opts) {
        rest(opts.server + '/shutdown', { method: 'POST' });
    });

nomnom.parse();
