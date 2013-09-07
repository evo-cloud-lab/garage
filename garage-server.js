#!/usr/bin/env node

var elements = require('evo-elements'),
    conf     = elements.Config.conf(),

    Server = require('./index').Server;

new Server(conf.opts).start(function (err) {
    err ? console.error('Failed to listen') : console.info('Garage started');
});