"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class JJYUserMedia {
    static huoqumeiti() {
        // todo 这里需要修改参数
        return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
}
exports.JJYUserMedia = JJYUserMedia;
