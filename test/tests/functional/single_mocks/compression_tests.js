'use strict';
var Server = require('../../../../lib/topologies/server'),
  expect = require('chai').expect,
  co = require('co'),
  mock = require('mongodb-mock-server');

describe('Single Compression (mocks)', function() {
  afterEach(() => mock.cleanup());

  it("server should recieve list of client's supported compressors in handshake", {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      // Prepare the server's response
      var serverResponse = Object.assign({}, mock.DEFAULT_ISMASTER);

      // Boot the mock
      co(function*() {
        const server = yield mock.createServer();

        server.setMessageHandler(request => {
          expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
          request.reply(serverResponse);
        });

        // Attempt to connect
        var client = new Server(
          Object.assign({}, server.address(), {
            connectionTimeout: 5000,
            socketTimeout: 1000,
            size: 1,
            compression: { compressors: ['snappy', 'zlib'], zlibCompressionLevel: -1 }
          })
        );

        client.on('connect', function() {
          client.destroy();
          done();
        });

        client.connect();
      });
    }
  });

  it(
    'should connect and insert document when server is responding with OP_COMPRESSED with no compression',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var currentStep = 0;

        // Prepare the server's response
        let serverResponse = Object.assign({}, mock.DEFAULT_ISMASTER);

        // Boot the mock
        co(function*() {
          const server = yield mock.createServer();

          server.setMessageHandler(request => {
            var doc = request.document;

            if (currentStep === 0) {
              expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
              expect(server.isCompressed).to.be.false;
              // Acknowledge connection using OP_COMPRESSED with no compression
              request.reply(serverResponse, { compression: { compressor: 'no_compression' } });
            } else if (currentStep === 1) {
              expect(server.isCompressed).to.be.false;
              // Acknowledge insertion using OP_COMPRESSED with no compression
              request.reply(
                { ok: 1, n: doc.documents.length, lastOp: new Date() },
                { compression: { compressor: 'no_compression' } }
              );
            } else if (currentStep === 2 || currentStep === 3) {
              expect(server.isCompressed).to.be.false;
              // Acknowledge update using OP_COMPRESSED with no compression
              request.reply({ ok: 1, n: 1 }, { compression: { compressor: 'no_compression' } });
            } else if (currentStep === 4) {
              expect(server.isCompressed).to.be.false;
              request.reply({ ok: 1 }, { compression: { compressor: 'no_compression' } });
            }
            currentStep++;
          });

          // Attempt to connect
          var client = new Server(
            Object.assign({}, server.address(), {
              connectionTimeout: 5000,
              socketTimeout: 1000,
              size: 1,
              compression: { compressors: ['snappy', 'zlib'] }
            })
          );

          // Connect and try inserting, updating, and removing
          // All outbound messages from the driver will be uncompressed
          // Inbound messages from the server should be OP_COMPRESSED with no compression
          client.on('connect', function(_server) {
            _server.insert('test.test', [{ a: 1, created: new Date() }], function(err, r) {
              expect(err).to.be.null;
              expect(r.result.n).to.equal(1);

              _server.update('test.test', { q: { a: 1 }, u: { $set: { b: 1 } } }, function(
                _err,
                _r
              ) {
                expect(_err).to.be.null;
                expect(_r.result.n).to.equal(1);

                _server.remove('test.test', { q: { a: 1 } }, function(__err, __r) {
                  expect(__err).to.be.null;
                  expect(__r.result.n).to.equal(1);

                  _server.command('system.$cmd', { ping: 1 }, function(___err, ___r) {
                    expect(___err).to.be.null;
                    expect(___r.result.ok).to.equal(1);

                    client.destroy();
                    done();
                  });
                });
              });
            });
          });

          client.connect();
        });
      }
    }
  );

  it(
    'should connect and insert document when server is responding with OP_COMPRESSED with snappy compression',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        var currentStep = 0;

        // Prepare the server's response
        var serverResponse = Object.assign({}, mock.DEFAULT_ISMASTER, {
          compression: ['snappy']
        });

        // Boot the mock
        co(function*() {
          const server = yield mock.createServer();

          server.setMessageHandler(request => {
            var doc = request.document;
            if (currentStep === 0) {
              expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
              expect(server.isCompressed).to.be.false;
              // Acknowledge connection using OP_COMPRESSED with snappy
              request.reply(serverResponse, { compression: { compressor: 'snappy' } });
            } else if (currentStep === 1) {
              expect(server.isCompressed).to.be.true;
              // Acknowledge insertion using OP_COMPRESSED with snappy
              request.reply(
                { ok: 1, n: doc.documents.length, lastOp: new Date() },
                { compression: { compressor: 'snappy' } }
              );
            } else if (currentStep === 2 || currentStep === 3) {
              expect(server.isCompressed).to.be.true;
              // Acknowledge update using OP_COMPRESSED with snappy
              request.reply({ ok: 1, n: 1 }, { compression: { compressor: 'snappy' } });
            } else if (currentStep === 4) {
              expect(server.isCompressed).to.be.true;
              request.reply({ ok: 1 }, { compression: { compressor: 'snappy' } });
            }
            currentStep++;
          });

          // Attempt to connect
          var client = new Server(
            Object.assign({}, server.address(), {
              connectionTimeout: 5000,
              socketTimeout: 1000,
              size: 1,
              compression: { compressors: ['snappy', 'zlib'] }
            })
          );

          // Connect and try inserting, updating, and removing
          // All outbound messages from the driver (after initial connection) will be OP_COMPRESSED using snappy
          // Inbound messages from the server should be OP_COMPRESSED with snappy
          client.on('connect', function(_server) {
            _server.insert('test.test', [{ a: 1, created: new Date() }], function(err, r) {
              expect(err).to.be.null;
              expect(r.result.n).to.equal(1);

              _server.update('test.test', { q: { a: 1 }, u: { $set: { b: 1 } } }, function(
                _err,
                _r
              ) {
                expect(_err).to.be.null;
                expect(_r.result.n).to.equal(1);

                _server.remove('test.test', { q: { a: 1 } }, function(__err, __r) {
                  expect(__err).to.be.null;
                  expect(__r.result.n).to.equal(1);

                  _server.command('system.$cmd', { ping: 1 }, function(___err, ___r) {
                    expect(___err).to.be.null;
                    expect(___r.result.ok).to.equal(1);

                    client.destroy();
                    done();
                  });
                });
              });
            });
          });

          client.connect();
        });
      }
    }
  );

  it(
    'should connect and insert document when server is responding with OP_COMPRESSED with zlib compression',
    {
      metadata: {
        requires: {
          generators: true,
          topology: 'single'
        }
      },

      test: function(done) {
        // Contain mock server
        var server = null;
        var currentStep = 0;

        // Prepare the server's response
        var serverResponse = Object.assign({}, mock.DEFAULT_ISMASTER, {
          compression: ['zlib']
        });

        // Boot the mock
        co(function*() {
          server = yield mock.createServer();

          server.setMessageHandler(request => {
            var doc = request.document;
            if (currentStep === 0) {
              expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
              expect(server.isCompressed).to.be.false;
              // Acknowledge connection using OP_COMPRESSED with zlib
              request.reply(serverResponse, { compression: { compressor: 'zlib' } });
            } else if (currentStep === 1) {
              expect(server.isCompressed).to.be.true;
              // Acknowledge insertion using OP_COMPRESSED with zlib
              request.reply(
                { ok: 1, n: doc.documents.length, lastOp: new Date() },
                { compression: { compressor: 'zlib' } }
              );
            } else if (currentStep === 2 || currentStep === 3) {
              // Acknowledge update using OP_COMPRESSED with zlib
              expect(server.isCompressed).to.be.true;
              request.reply({ ok: 1, n: 1 }, { compression: { compressor: 'zlib' } });
            } else if (currentStep === 4) {
              expect(server.isCompressed).to.be.true;
              request.reply({ ok: 1 }, { compression: { compressor: 'zlib' } });
            }
            currentStep++;
          });

          // Attempt to connect
          var client = new Server(
            Object.assign({}, server.address(), {
              connectionTimeout: 5000,
              socketTimeout: 1000,
              size: 1,
              compression: { compressors: ['snappy', 'zlib'] }
            })
          );

          // Connect and try inserting, updating, and removing
          // All outbound messages from the driver (after initial connection) will be OP_COMPRESSED using zlib
          // Inbound messages from the server should be OP_COMPRESSED with zlib
          client.on('connect', function(_server) {
            _server.insert('test.test', [{ a: 1, created: new Date() }], function(err, r) {
              expect(err).to.be.null;
              expect(r.result.n).to.equal(1);

              _server.update('test.test', { q: { a: 1 }, u: { $set: { b: 1 } } }, function(
                _err,
                _r
              ) {
                expect(_err).to.be.null;
                expect(_r.result.n).to.equal(1);

                _server.remove('test.test', { q: { a: 1 } }, function(__err, __r) {
                  expect(__err).to.be.null;
                  expect(__r.result.n).to.equal(1);

                  _server.command('system.$cmd', { ping: 1 }, function(___err, ___r) {
                    expect(___err).to.be.null;
                    expect(___r.result.ok).to.equal(1);

                    client.destroy();
                    done();
                  });
                });
              });
            });
          });

          client.connect();
        });
      }
    }
  );

  it('should not compress uncompressible commands', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      // Contain mock server
      var server = null;
      var currentStep = 0;

      // Prepare the server's response
      var serverResponse = Object.assign({}, mock.DEFAULT_ISMASTER, {
        compression: ['snappy']
      });

      // Boot the mock
      co(function*() {
        server = yield mock.createServer();

        server.setMessageHandler(request => {
          if (currentStep === 0) {
            expect(request.response.documents[0].compression).to.have.members(['snappy', 'zlib']);
            expect(server.isCompressed).to.be.false;
            // Acknowledge connection using OP_COMPRESSED with snappy
            request.reply(serverResponse, { compression: { compressor: 'snappy' } });
          } else if (currentStep === 1) {
            expect(server.isCompressed).to.be.true;
            // Acknowledge ping using OP_COMPRESSED with snappy
            request.reply({ ok: 1 }, { compression: { compressor: 'snappy' } });
          } else if (currentStep >= 2) {
            expect(server.isCompressed).to.be.false;
            // Acknowledge further uncompressible commands using OP_COMPRESSED with snappy
            request.reply({ ok: 1 }, { compression: { compressor: 'snappy' } });
          }
          currentStep++;
        });

        // Attempt to connect
        var client = new Server(
          Object.assign({}, server.address(), {
            connectionTimeout: 5000,
            socketTimeout: 1000,
            size: 1,
            compression: { compressors: ['snappy', 'zlib'] }
          })
        );

        // Connect and try some commands, checking that uncompressible commands are indeed not compressed
        client.on('connect', function(_server) {
          _server.command('system.$cmd', { ping: 1 }, function(err, r) {
            expect(err).to.be.null;
            expect(r.result.ok).to.equal(1);

            _server.command('system.$cmd', { ismaster: 1 }, function(_err, _r) {
              expect(_err).to.be.null;
              expect(_r.result.ok).to.equal(1);

              _server.command('system.$cmd', { getnonce: 1 }, function(__err, __r) {
                expect(__err).to.be.null;
                expect(__r.result.ok).to.equal(1);

                _server.command('system.$cmd', { ismaster: 1 }, function(___err, ___r) {
                  expect(___err).to.be.null;
                  expect(___r.result.ok).to.equal(1);

                  client.destroy();
                  done();
                });
              });
            });
          });
        });

        client.connect();
      });
    }
  });
});
