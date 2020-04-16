define("meiti", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Meiti = /** @class */ (function () {
        function Meiti() {
        }
        Meiti.huoqumeiti = function () {
            return navigator.mediaDevices.getUserMedia();
        };
        return Meiti;
    }());
    exports.Meiti = Meiti;
});
