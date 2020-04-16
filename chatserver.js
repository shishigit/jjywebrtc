"use strict";

const WebSocketServer = require('ws');

let connectionArray = [];
let lianjieid = Date.now();

function sendUserListToAll()
{
    const userListMsgStr = JSON.stringify({
        type: "userlist",
        users: connectionArray.map(value => value.username)
    });
    connectionArray.forEach(value => value.send(userListMsgStr))
}

const wsServer = new WebSocketServer.Server({port: 6503}, () => console.log('系统启动'));

wsServer.on('connection', function (connection)
{
    connectionArray.push(connection);
    connection.username = lianjieid.toString();
    lianjieid++;

    // 设定ID
    connection.send(JSON.stringify({
        type: "id",
        id: connection.username
    }));

    sendUserListToAll();

    connection.on('message', function (message)
    {
        let msg = JSON.parse(message);
        connectionArray.filter(value => value.username === msg.target).pop().send(message)

    });

    connection.on('close', function ()
    {
        connectionArray = connectionArray.filter(el => el.connected);
        sendUserListToAll();
    });
});
