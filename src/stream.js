const { Transform } = require('stream');

export default class EMLStream extends Transform {
    
    constructor() {
        super();
        this.buffer = new Buffer('');
    }

    _transform(chunk, encoding, done) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.push(chunk);
        return done();
    }
    
}
