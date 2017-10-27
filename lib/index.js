'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _mailparser = require('mailparser');

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _stream = require('./stream');

var _stream2 = _interopRequireDefault(_stream);

var _imap = require('imap');

var _imap2 = _interopRequireDefault(_imap);

var _lodash = require('lodash');

var _fs = require('fs');

var _async = require('async');

var _path = require('path');

var path = _interopRequireWildcard(_path);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = require('debug')('imap:listener');

var eachPromise = function eachPromise(data, func, log) {
    return new Promise(function (resolve, reject) {
        (0, _async.each)(data, function (item, done) {
            return func(item).catch(log).then(done);
        }, function (err) {
            if (err) return reject(err);
            resolve();
        });
    });
};

var MailListener = function (_EventEmitter) {
    _inherits(MailListener, _EventEmitter);

    function MailListener(options) {
        _classCallCheck(this, MailListener);

        var _this = _possibleConstructorReturn(this, (MailListener.__proto__ || Object.getPrototypeOf(MailListener)).call(this));

        _this.retry = 0;
        _this.lastUID = 0;
        _this.employed = false;
        _this.forceStop = false;
        _this.haveNewEmails = false;
        _this.defaultOptions = {
            filter: ['UNSEEN'],
            mailbox: 'INBOX',
            setSince: true,
            markSeen: false,
            setFlags: false,
            fetchFromNow: true,
            fetchOnStart: false,
            parserOptions: {
                keepCidLinks: false,
                streamAttachments: false
            },
            attachmentOptions: {
                download: false,
                directory: ''
            },
            imapOptions: {
                connTimeout: 10000,
                authTimeout: 5000,
                retryDelay: 1000,
                keepalive: true,
                tlsOptions: {},
                debug: debug,
                maxRetry: 3
            }
        };
        _this.options = (0, _lodash.defaultsDeep)(options, _this.defaultOptions);
        _this.options.filter = typeof _this.options.filter === 'string' ? [_this.options.filter] : _this.options.filter;
        _this.options.parserOptions.streamAttachments = _this.options.attachmentOptions.download && _this.options.attachmentOptions.stream;
        _this.imap = new _imap2.default(_this.options.imapOptions);
        _this.imap.on('error', _this.onError.bind(_this));
        _this.imap.on('close', _this.onClose.bind(_this));
        _this.imap.on('ready', _this.onReady.bind(_this));
        _this.lastFetch = _this.options.fetchFromNow;
        return _this;
    }

    _createClass(MailListener, [{
        key: 'start',
        value: function start() {
            debug('detaching existing listener');
            this.imap.removeAllListeners('update');
            this.imap.removeAllListeners('mail');

            debug('calling imap connect');
            this.imap.connect();
        }
    }, {
        key: 'stop',
        value: function stop() {
            this.forceStop = true;
            this.imap.end();
        }
    }, {
        key: 'search',
        value: function search() {
            var _this2 = this;

            var filter = this.options.filter.slice();
            if (this.lastFetch === true) this.lastFetch = new Date();
            if (this.lastFetch === false) this.lastFetch = new Date(0);
            if (this.options.setSince) filter.push(["SINCE", this.lastFetch]);
            this.lastFetch = new Date();
            this.imap.search(filter, function (err, uids) {
                if (err) return _this2.onError(err);
                if (uids.length > 0) {
                    if (_this2.options.setFlags) {
                        _this2.imap.setFlags(uids, ['\\Seen'], function (err) {
                            if (err) _this2.onError(err);
                        });
                    }
                    return eachPromise(uids, _this2.fetch.bind(_this2), _this2.onError.bind(_this2)).catch(_this2.onError).then(function () {
                        debug('all processed');
                        if (_this2.haveNewEmails) {
                            _this2.haveNewEmails = false;
                            return _this2.search();
                        }
                        _this2.employed = false;
                    });
                }
                if (_this2.haveNewEmails) {
                    _this2.haveNewEmails = false;
                    return _this2.search();
                }
                _this2.employed = false;
            });
        }
    }, {
        key: 'fetch',
        value: function fetch(uid) {
            var _this3 = this;

            var locked = false;
            return new Promise(function (resolve, reject) {
                if (_this3.lastUID >= uid) return resolve();
                var fetch = _this3.imap.fetch(uid, {
                    markSeen: _this3.options.markSeen,
                    bodies: ''
                });
                fetch.on('message', function (msg, seg) {
                    locked = true;
                    var attributes = null;
                    msg.on('attributes', function (attrs) {
                        attributes = attrs;
                    });
                    msg.on('body', function (stream) {
                        var emlStream = new _stream2.default();
                        stream.pipe(emlStream);
                        _this3.parse(emlStream).then(function (mail) {
                            if (!mail) mail = {};
                            mail.eml = emlStream.buffer.toString('utf-8');
                            if (!_this3.options.parserOptions.streamAttachments && _this3.options.attachmentOptions.download && mail.attachments) {
                                return eachPromise(mail.attachments, function (attachment) {
                                    return new Promise(function (resolve, reject) {
                                        (0, _fs.writeFile)(_this3.options.attachmentOptions.directory + attachment.generatedFileName, attachment.content, function (err) {
                                            if (err) return reject(err);
                                            attachment.path = path.resolve(_this3.options.attachmentOptions.directory + attachment.generatedFileName);
                                            _this3.emit('attachment', attachment);
                                            resolve();
                                        });
                                    });
                                }, _this3.onError.bind(_this3)).catch(_this3.onError.bind(_this3)).then(function () {
                                    return mail;
                                });
                            }
                            return mail;
                        }).then(function (mail) {
                            _this3.emit('mail', mail, seg, attributes);
                            if (_this3.lastUID < uid) _this3.lastUID = uid;
                            resolve();
                        }).catch(reject);
                    });
                });
                fetch.once('error', _this3.onError);
                fetch.once('end', function () {
                    if (!locked) resolve();
                });
            });
        }
    }, {
        key: 'parse',
        value: function parse(input) {
            var _this4 = this;

            var mail = {
                attachments: []
            };
            return new Promise(function (resolve, reject) {
                var parser = new _mailparser.MailParser(_this4.options.parserOptions);
                parser.on('headers', function (headers) {
                    mail.headers = headers;
                });
                parser.on('data', function (data) {
                    if (data.type === 'text') {
                        Object.keys(data).forEach(function (key) {
                            if (['text', 'html', 'textAsHtml'].includes(key)) {
                                mail[key] = data[key];
                            }
                        });
                    }
                    if (data.type === 'attachment') {
                        if (_this4.options.attachmentOptions.download) mail.attachments.push(data);
                        _this4.emit('attachment', data);

                        var chunklen = 0;
                        var chunks = [];

                        data.content.on('readable', function () {
                            var chunk = void 0;
                            while ((chunk = data.content.read()) !== null) {
                                chunklen += chunk.length;
                                chunks.push(chunk);
                            }
                        });
                        data.content.on('end', function () {
                            data.content = Buffer.concat(chunks, chunklen);
                            data.release();
                        });
                    }
                });
                parser.on('end', function () {
                    ['subject', 'references', 'date', 'to', 'from', 'to', 'cc', 'bcc', 'message-id', 'in-reply-to', 'reply-to'].forEach(function (key) {
                        if (mail.headers.has(key)) mail[key.replace(/-([a-z])/g, function (m, c) {
                            return c.toUpperCase();
                        })] = mail.headers.get(key);
                    });

                    if (_this4.options.parserOptions.keepCidLinks) return resolve(mail);

                    parser.updateImageLinks(function (attachment, done) {
                        return done(false, 'data:' + attachment.contentType + ';base64,' + attachment.content.toString('base64'));
                    }, function (err, html) {
                        if (err) return reject(err);
                        mail.html = html;
                        resolve(mail);
                    });
                });

                if (typeof input === 'string') parser.end(Buffer.from(input));else if (Buffer.isBuffer(input)) parser.end(input);else input.pipe(parser);
            });
        }
    }, {
        key: 'onError',
        value: function onError(err) {
            this.emit('error', err);
        }
    }, {
        key: 'onClose',
        value: function onClose() {
            var _this5 = this;

            if (!this.forceStop && this.retry < this.options.imapOptions.maxRetry) {
                setTimeout(function () {
                    debug("Trying to establish imap connection again...");
                    _this5.start();
                }, this.options.imapOptions.retryDelay);
                return this.retry++;
            }
            this.emit('disconnected');debug('disconnected');
            this.forceStop = false;
            this.retry = 0;
        }
    }, {
        key: 'onReady',
        value: function onReady() {
            var _this6 = this;

            this.imap.openBox(this.options.mailbox, false, function (err) {
                if (err) return _this6.onError(err);
                _this6.emit('connected');debug('connected');
                if (_this6.options.fetchOnStart) _this6.search();
                _this6.imap.on('mail', _this6.onMail.bind(_this6));
                _this6.imap.on('update', _this6.onMail.bind(_this6));
            });
        }
    }, {
        key: 'onMail',
        value: function onMail() {
            if (!this.haveNewEmails && !this.employed) {
                this.employed = true;
                this.search();
            } else if (this.employed) this.haveNewEmails = true;
        }
    }]);

    return MailListener;
}(_events2.default);

exports.default = MailListener;
//# sourceMappingURL=index.js.map