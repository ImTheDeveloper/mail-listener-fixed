import { MailParser } from 'mailparser';
import EventEmitter from 'events';
import EMLStream from './stream';
import IMAP from 'imap';

import { defaultsDeep } from 'lodash';
import { writeFile } from 'fs';
import { each } from 'async';
import * as path from 'path';

const debug = require('debug')('imap:listener');

const eachPromise = (data, func, log) => {
    return new Promise((resolve, reject) => {
        each(data, (item, done) => func(item).catch(log).then(done), err => {
            if (err) return reject(err);
            resolve();
        });
    });
};

export default class MailListener extends EventEmitter {
    
    constructor(options) {
        super();
        this.retry = 0;
        this.lastUID = 0;
        this.employed = false;
        this.forceStop = false;
        this.haveNewEmails = false;
        this.defaultOptions = {
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
        this.options = defaultsDeep(options, this.defaultOptions);
        this.options.filter = typeof this.options.filter === 'string' ? [this.options.filter] : this.options.filter;
        this.options.parserOptions.streamAttachments = this.options.attachmentOptions.download && this.options.attachmentOptions.stream;
        this.imap = new IMAP(this.options.imapOptions);
        this.imap.on('error', this.onError.bind(this));
        this.imap.on('close', this.onClose.bind(this));
        this.imap.on('ready', this.onReady.bind(this));
        this.lastFetch = this.options.fetchFromNow;
    }
    
    start() {
        debug('detaching existing listener');
        this.imap.removeAllListeners('update');
        this.imap.removeAllListeners('mail');

        debug('calling imap connect');
        this.imap.connect();
    }
    
    stop() {
        this.forceStop = true;
        this.imap.end();
    }
    
    search() {
        let filter = this.options.filter.slice();
        if (this.lastFetch === true) this.lastFetch = new Date();
        if (this.lastFetch === false) this.lastFetch = new Date(0);
        if (this.options.setSince) filter.push(["SINCE", this.lastFetch]);
        this.lastFetch = new Date();
        this.imap.search(filter, (err, uids) => {
            if (err) return this.onError(err);
            if (uids.length > 0) {
                if (this.options.setFlags) {
                    this.imap.setFlags(uids, ['\\Seen'], err => {
                         if (err) this.onError(err);
                    });
                }
                return eachPromise(uids, this.fetch.bind(this), this.onError.bind(this))
                    .catch(this.onError)
                    .then(() => {
                        debug('all processed');
                        if (this.haveNewEmails) {
                            this.haveNewEmails = false;
                            return this.search();
                        }
                        this.employed = false;
                    });
            }
            if (this.haveNewEmails) {
                this.haveNewEmails = false;
                return this.search();
            }
            this.employed = false;
        });
    }
    
    fetch(uid) {
        let locked = false;
        return new Promise((resolve, reject) => {
            if (this.lastUID >= uid) return resolve();
            let fetch = this.imap.fetch(uid, {
                markSeen: this.options.markSeen,
                bodies: ''
            });
            fetch.on('message', (msg, seg) => {
                locked = true;
                let attributes = null;
                msg.on('attributes', attrs => {
                    attributes = attrs;
                });
                msg.on('body', stream => {
                    let emlStream = new EMLStream();
                    stream.pipe(emlStream);
                    this.parse(emlStream)
                        .then(mail => {
                            if (!mail) mail = {};
                            mail.eml = emlStream.buffer.toString('utf-8');
                            if (!this.options.parserOptions.streamAttachments && this.options.attachmentOptions.download && mail.attachments) {
                                return eachPromise(mail.attachments, attachment => {
                                    return new Promise((resolve, reject) => {
                                        writeFile(this.options.attachmentOptions.directory + attachment.generatedFileName, attachment.content, err => {
                                            if (err) return reject(err);
                                            attachment.path = path.resolve(this.options.attachmentOptions.directory + attachment.generatedFileName);
                                            this.emit('attachment', attachment);
                                            resolve();
                                        });  
                                    });
                                }, this.onError.bind(this)).catch(this.onError.bind(this)).then(() => mail);
                            }
                            return mail;
                            
                        })
                        .then(mail => {
                            this.emit('mail', mail, seg, attributes);
                            if (this.lastUID < uid) this.lastUID = uid;
                            resolve();
                        })
                        .catch(reject);
                });
            });
            fetch.once('error', this.onError);
            fetch.once('end', () => {
                if (!locked) resolve();
            });
        });
    }
    
    parse(input) {
        let mail = {
            attachments: []
        };
        return new Promise((resolve, reject) => {
            let parser = new MailParser(this.options.parserOptions);
            parser.on('headers', headers => {
                mail.headers = headers;
            });
            parser.on('data', data => {
                if (data.type === 'text') {
                    Object.keys(data).forEach(key => {
                        if (['text', 'html', 'textAsHtml'].includes(key)) {
                            mail[key] = data[key];
                        }
                    });
                }
                if (data.type === 'attachment') {
                    if (this.options.attachmentOptions.download) mail.attachments.push(data);
                    this.emit('attachment', data);

                    let chunklen = 0;
                    let chunks = [];
                    
                    data.content.on('readable', () => {
                        let chunk;
                        while ((chunk = data.content.read()) !== null) {
                            chunklen += chunk.length;
                            chunks.push(chunk);
                        }
                    });
                    data.content.on('end', () => {
                        data.content = Buffer.concat(chunks, chunklen);
                        data.release();
                    });
                }
            });
            parser.on('end', () => {
                ['subject', 'references', 'date', 'to', 'from', 'to', 'cc', 'bcc', 'message-id', 'in-reply-to', 'reply-to'].forEach(key => {
                    if (mail.headers.has(key)) mail[key.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = mail.headers.get(key);
                });
                
                if (this.options.parserOptions.keepCidLinks) return resolve(mail);
                
                parser.updateImageLinks(
                    (attachment, done) => done(false, 'data:' + attachment.contentType + ';base64,' + attachment.content.toString('base64')),
                    (err, html) => {
                        if (err) return reject(err);
                        mail.html = html;
                        resolve(mail);
                    }
                );
            });
            
            if (typeof input === 'string') parser.end(Buffer.from(input));
            else if (Buffer.isBuffer(input)) parser.end(input);
            else input.pipe(parser);
        });
    }

    onError(err) {
        this.emit('error', err);
    }

    onClose() {
        if (!this.forceStop && this.retry < this.options.imapOptions.maxRetry) {
            setTimeout(() => {
                debug("Trying to establish imap connection again...");
                this.start()
            }, this.options.imapOptions.retryDelay);
            return this.retry++;
        }
        this.emit('disconnected'); debug('disconnected');
        this.forceStop = false;
        this.retry = 0;
    }

    onReady() {
        this.imap.openBox(this.options.mailbox, false, err => {
            if (err) return this.onError(err);
            this.emit('connected'); debug('connected');
            if (this.options.fetchOnStart) this.search();
            this.imap.on('mail', this.onMail.bind(this));
            this.imap.on('update', this.onMail.bind(this));
        });
    }
    
    onMail() {
        if (!this.haveNewEmails && !this.employed) { 
            this.employed = true;
            this.search();
        }
        else if (this.employed) this.haveNewEmails = true;
    }
    
}
