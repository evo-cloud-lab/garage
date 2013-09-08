#!/usr/bin/env node

var elements = require('evo-elements'),
    conf     = elements.Config.conf(),

    Server = require('./index').Server,
    V = require('./version');

var server = new Server(V, conf.opts);

server.start(function (err) {
    err ? console.error(err) : console.info('Garage started on %s:%s', server.address, server.port);
});