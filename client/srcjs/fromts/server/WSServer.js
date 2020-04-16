"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
let connectionArray = [];
let lianjieid = Date.now();
const WSServer = new ws_1.default.Server({ port: 6503 }, () => console.log('系统启动'));
WSServer.on('connection', function (connection) {
    // 设定ID
    connectionArray.push({ id: lianjieid.toString(), socket: connection });
    connection.send(JSON.stringify({
        type: "id",
        id: lianjieid.toString()
    }));
    lianjieid++;
    console.log('当前连接：', connectionArray.map(value => value.id));
    const userListMsgStr = JSON.stringify({
        type: "userlist",
        users: connectionArray.map(value => value.id)
    });
    connectionArray.forEach(value => value.socket.send(userListMsgStr));
    connection.on('message', function (message) {
        let msg = JSON.parse(message);
        let conn = connectionArray.filter(value => value.id === msg.target).pop();
        if (conn)
            conn.socket.send(message);
    });
    connection.on('close', () => connectionArray = connectionArray.filter(el => el.socket !== connection));
});
