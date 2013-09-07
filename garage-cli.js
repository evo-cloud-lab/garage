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
        json: true
    };
    if (opts.data) {
        requestOptions.body = opts.data;
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

function printCluster(cluster) {
    console.log(cluster.name.green.bold.underline);
    for (var key in cluster) {
        if (key != 'name') {
            console.log('    ' + align(key, 16).white + ' ' + cluster[key].toString().grey);
        }
    }
}

var STATES = {
    RUNNING: 'green',
    STOPPED: 'blue',
    UNPROVISIONED: 'grey'
};

function renderState(state) {
    var color = STATES[state];
    return color ? state[color] : state.grey;
}

function printNode(id, status) {
    console.log(id.toString().green.bold.underline);
    for (var key in status) {
        if (key == 'state') {
            console.log('    ' + align(key, 16).cyan + ' ' + renderState(status[key]));
        } else {
            console.log('    ' + align(key, 16).white + ' ' + status[key].toString().grey);
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
                printNode(id, data[id]);
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
