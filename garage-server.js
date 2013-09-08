#!/usr/bin/env node

var elements = require('evo-elements'),
    conf     = elements.Config.conf(),

    Server = require('./index').Server;

var server = new Server(conf.opts);

server.start(function (err) {
    err ? console.error(err) : console.info('Garage started on %s:%s', server.address, server.port);
});