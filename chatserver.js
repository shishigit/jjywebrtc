"use strict";

const WebSocketServer = require('ws');

let connectionArray = [];
let lianjieid = Date.now();

function sendToOneUser(target, msgString)
{
    let i;

    for (i = 0; i < connectionArray.length; i++)
    {
        if (connectionArray[i].username == target)
        {
            connectionArray[i].send(msgString);
            break;
        }
    }
}

function sendUserListToAll()
{
    const yonghuliebiao = {
        type: "userlist",
        users: []
    };
    connectionArray.forEach(value => yonghuliebiao.users.push(value.username))
    const userListMsgStr = JSON.stringify(yonghuliebiao);
    connectionArray.forEach(value => value.send(userListMsgStr))
}

const wsServer = new WebSocketServer.Server({port: 6503}, () => console.log('系统启动'));

wsServer.on('connection', function (connection)
{
    connectionArray.push(connection);
    connection.clientID = lianjieid;
    connection.username = lianjieid;
    lianjieid++;

    // 设定ID
    connection.send(JSON.stringify({
        type: "id",
        id: connection.clientID
    }));

    sendUserListToAll();

    connection.on('message', function (message)
    {
        let msg = JSON.parse(message);
        sendToOneUser(msg.target, message);
    });

    connection.on('close', function ()
    {
        connectionArray = connectionArray.filter(el => el.connected);
        sendUserListToAll();
    });
});
