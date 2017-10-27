'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _require = require('stream'),
    Transform = _require.Transform;

var EMLStream = function (_Transform) {
    _inherits(EMLStream, _Transform);

    function EMLStream() {
        _classCallCheck(this, EMLStream);

        var _this = _possibleConstructorReturn(this, (EMLStream.__proto__ || Object.getPrototypeOf(EMLStream)).call(this));

        _this.buffer = new Buffer('');
        return _this;
    }

    _createClass(EMLStream, [{
        key: '_transform',
        value: function _transform(chunk, encoding, done) {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.push(chunk);
            return done();
        }
    }]);

    return EMLStream;
}(Transform);

exports.default = EMLStream;
//# sourceMappingURL=stream.js.map