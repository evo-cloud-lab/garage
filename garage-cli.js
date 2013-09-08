#!/usr/bin/env node

var nomnom  = require('nomnom'),
    request = require('request'),
    colors  = require('colors');

function fatal(err) {
    console.log(err.message.red);
    console.log('FAIL'.red);
    process.exit(1);
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
    } else if (typeof(opts) == 'object') {
        opts = {
            method: 'POST',
            data: opts
        }
    }
    var requestOptions = {
        url: path,
        method: opts.method,
        json: true,
        headers: {}
    };
    if (opts.data) {
        requestOptions.body = opts.data;
    } else if (opts.method == 'POST' || opts.method == 'PUT') {
        requestOptions.headers['Content-Length'] = '0';
    }

    request(requestOptions, function (err, response, body) {
        try {
            if (err) {
                throw err;
            } else if (response.statusCode >= 400) {
                var message = body && body.message && body.message.toString();
                if (message) {
                    console.log(message.red);
                }
                throw new Error('Request failed ' + response.statusCode);
            } else {
                done = function (err) {
                    if (err) {
                        fatal(err);
                    } else {
                        console.log('OK'.green);
                    }
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
            printPair(k, val[k], prefix + prefix);
        }
    } else if (Array.isArray(val)) {
        console.log(align(prefix + key, ALIGN).white);
        for (var n in val) {
            printPair('-', val[n], prefix + prefix);
        }
    } else {
        console.log(align(prefix + key, ALIGN).white + ' ' + val.toString().grey);
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

function printNode(name, status) {
    console.log(name.yellow.bold);
    for (var key in status) {
        if (key == 'state') {
            console.log(align(PREFIX + key, ALIGN).cyan + ' ' + renderState(status[key]));
        } else {
            console.log(align(PREFIX + key, ALIGN).white + ' ' + status[key].toString().grey);
        }
    }
}

nomnom.script('garage-cli')
    .options({
        server: {
            abbr: 's',
            metavar: 'URL',
            help: 'Server URL',
            default: 'http://localhost:3030'
        }
    });

nomnom.command('clusters')
    .help('List all clusters')
    .callback(function (opts) {
        rest(opts.server + '/clusters', function (data) {
            for (var name in data) {
                printCluster(data[name]);
            }
        });
    });

nomnom.command('reload')
    .help('Reload all cluster configurations')
    .callback(function (opts) {
        rest(opts.server + '/clusters/reload', { method: 'POST' });
    });

nomnom.command('add-cluster')
        .option('PATH', {
            position: 1,
            required: true,
            type: 'string',
            help: 'The directory with cluster.yml and will contain cluster files'
        })
    .help('Register a new cluster')
    .callback(function (opts) {
        rest(opts.server + '/clusters', { path: opts.PATH }, function (data) {
            printCluster(data);
        });
    });

nomnom.command('nodes')
        .option('CLUSTER', {
            position: 1,
            required: true,
            type: 'string',
            help: 'Name of the cluster'
        })
    .help('List all nodes in CLUSTER')
    .callback(function (opts) {
        rest(opts.server + '/clusters/' + opts.CLUSTER + '/nodes', function (data) {
            for (var id in data) {
                printNode(opts.CLUSTER + '-' + id, data[id]);
            }
        });
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
        rest(opts.server + '/clusters/' + opts.CLUSTER + '/nodes/' + opts.ID, function (data) {
            printNode(opts.ID, data);
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
    .help('Start nodes')
    .callback(function (opts) {
        rest(opts.server + '/clusters/' + opts.CLUSTER + '/start', { ids: opts.IDLIST });
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
    .help('Stop nodes')
    .callback(function (opts) {
        var data = {};
        opts.IDLIST && opts.IDLIST.length > 0 && (data.ids = opts.IDLIST);
        rest(opts.server + '/clusters/' + opts.CLUSTER + '/stop', data);
    });

nomnom.parse();
