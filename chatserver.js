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
        let sendToClients = true;
        let msg = JSON.parse(message);
        console.log(msg)
        const connect = connectionArray.filter(value => value.username.toString() === msg.target).pop();

        if (msg.type === "message")
        {
            msg.name = connect.username;
            msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
        }

        if (sendToClients)
        {
            const msgString = JSON.stringify(msg);

            if (msg.target && msg.target.length !== 0)
            {
                sendToOneUser(msg.target, msgString);
            } else
            {
                let i;
                for (i = 0; i < connectionArray.length; i++)
                {
                    connectionArray[i].send(msgString);
                }
            }
        }
    });

    connection.on('close', function ()
    {
        connectionArray = connectionArray.filter(el => el.connected);
        sendUserListToAll();
    });
});
