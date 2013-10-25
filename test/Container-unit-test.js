var assert = require('assert'),
    Try    = require('evo-elements').Try,

    Container = require('../lib/Container');

describe('Container', function () {
    var theContainer, collector;

    function expectAction(action, expectation, containerFactory) {
        it(expectation + ' ' + action, function () {
            var container = containerFactory ? containerFactory() : theContainer;
            if (expectation == 'reject') {
                assert.throws(function () {
                    container[action]();
                }, /Invalid operation/i);
            } else {
                assert.doesNotThrow(function () {
                    container[action]();
                });
            }
        });
    }

    function itAccept(action, containerFactory) {
        expectAction(action, 'accept', containerFactory);
    }

    function itReject(action, containerFactory) {
        expectAction(action, 'reject', containerFactory);
    }

    function audit(action) {
        collector[action] ++;
    }

    beforeEach(function () {
        collector = {
            load: 0,
            unload: 0,
            start: 0,
            stop: 0,
            status: 0
        };
    });

    describe('state: offline', function () {
        beforeEach(function () {
            theContainer = new Container(0, function () {
                return Object.create({
                    start: function () {},
                    stop: function () {}
                });
            });
            assert.equal(theContainer.state, 'offline');
        });

        itAccept('load');
        itAccept('unload');
        itReject('start');
        itReject('stop');
        itReject('status');
    });

    describe('state: loading', function () {
        beforeEach(function (done) {
            theContainer = new Container(0, function () {
                return Object.create({
                    load: function () {
                        audit('load');
                        Try.final(function () {
                            assert.equal(theContainer.state, 'loading');
                        }, done);
                    },
                    start: function () {},
                    stop: function () {}
                });
            });
            theContainer.load();
        });

        itAccept('load');
        itAccept('unload');
        itReject('start');
        itReject('stop');
        itReject('status');

        it('invoke load once', function () {
            theContainer.load().load();
            assert.equal(collector.load, 1);
        });
    });

    describe('state: unloading', function () {
        beforeEach(function (done) {
            theContainer = new Container(0, function () {
                return Object.create({
                    unload: function () {
                        audit('unload');
                        Try.final(function () {
                            assert.equal(theContainer.state, 'unloading');
                        }, done);
                    },
                    start: function () {},
                    stop: function () {}
                });
            });
            theContainer.on('state', function (state) {
                    state == 'stopped' && theContainer.unload();
                })
                .load();
        });

        itReject('load');
        itAccept('unload');
        itReject('start');
        itReject('stop');
        itReject('status');

        it('invoke unload once', function () {
            theContainer.unload().unload();
            assert.equal(collector.unload, 1);
        });
    });

    describe('state: stopped', function () {
        beforeEach(function (done) {
            theContainer = new Container(0, function () {
                return Object.create({
                    start: function () {},
                    stop: function () {}
                });
            });
            theContainer.on('state', function (state) {
                    state == 'stopped' && done();
                })
                .load();
        });

        itReject('load');
        itAccept('unload');
        itAccept('start');
        itAccept('stop');
        itAccept('status');
    });

    describe('state: starting', function () {
        beforeEach(function (done) {
            theContainer = new Container(0, function (id, monitorFn) {
                return Object.create({
                    start: function () {
                        audit('start');
                        Try.final(function () {
                            assert.equal(theContainer.state, 'starting');
                        }, done);
                    },
                    stop: function (opts) { audit('stop'); }
                });
            });
            theContainer.on('state', function (state) {
                    state == 'stopped' && theContainer.start();
                })
                .load();
        });

        itReject('load');
        itReject('unload');
        itAccept('start');
        itAccept('stop');
        itAccept('status');

        it('invoke start once', function () {
            theContainer.start().start();
            assert.equal(collector.start, 1);
        });

        it('invoke stop once', function () {
            theContainer.stop().stop();
            assert.equal(collector.stop, 1);
        });

        it('invoke stop many times with force', function () {
            theContainer.stop().stop({ force: true });
            assert.equal(collector.stop, 2);
        });
    });

    describe('state: running', function () {
        beforeEach(function (done) {
            theContainer = new Container(0, function (id, monitorFn) {
                return Object.create({
                    start: function (opts) {
                        audit('start');
                        Try.final(function () {
                            assert.equal(theContainer.state, 'starting');
                        }, done);
                        monitorFn('state', 'running');
                    },
                    stop: function (opts) { audit('stop'); monitorFn('state', 'running'); }
                });
            });
            theContainer.on('state', function (state) {
                    state == 'stopped' && theContainer.start();
                })
                .load();
        });

        itReject('load');
        itReject('unload');
        itAccept('start');
        itAccept('stop');
        itAccept('status');

        it('invoke start once', function () {
            theContainer.start().start();
            assert.equal(collector.start, 1);
        });

        it('invoke stop once', function () {
            theContainer.stop().stop();
            assert.equal(collector.stop, 1);
        });

        it('invoke stop many times with force', function () {
            theContainer.stop().stop({ force: true });
            assert.equal(collector.stop, 2);
        });
    });

    describe('state: stopping', function () {
        beforeEach(function (done) {
            theContainer = new Container(0, function (id, monitorFn) {
                return Object.create({
                    start: function (opts) { audit('start'); monitorFn('state', 'running'); },
                    stop: function () {
                        audit('stop');
                        Try.final(function () {
                            assert.equal(theContainer.state, 'stopping');
                        }, done);
                    }
                });
            });
            theContainer.on('state', function (state) {
                    switch (state) {
                        case 'stopped':
                            theContainer.start();
                            break;
                        case 'running':
                            theContainer.stop();
                            break;
                    }
                })
                .load();
        });

        itReject('load');
        itReject('unload');
        itReject('start');
        itAccept('stop');
        itAccept('status');

        it('invoke stop once', function () {
            theContainer.stop().stop();
            assert.equal(collector.stop, 1);
        });
    });
});
