"use strict";

const WebSocketServer = require('ws');

let connectionArray = [];
let lianjieid = Date.now();
let appendToMakeUnique = 1;

function isUsernameUnique(name)
{
    let isUnique = true;
    let i;

    for (i = 0; i < connectionArray.length; i++)
    {
        if (connectionArray[i].username === name)
        {
            isUnique = false;
            break;
        }
    }
    return isUnique;
}

function sendToOneUser(target, msgString)
{
    let i;

    for (i = 0; i < connectionArray.length; i++)
    {
        if (connectionArray[i].username === target)
        {
            connectionArray[i].send(msgString);
            break;
        }
    }
}

function getConnectionForID(id)
{
    return connectionArray.filter(value => value.clientID === id).pop()
}

function makeUserListMessage()
{
    const userListMsg = {
        type: "userlist",
        users: []
    };
    let i;

    for (i = 0; i < connectionArray.length; i++)
    {
        userListMsg.users.push(connectionArray[i].username);
    }

    return userListMsg;
}

function sendUserListToAll()
{
    const userListMsg = makeUserListMessage();
    const userListMsgStr = JSON.stringify(userListMsg);
    let i;

    for (i = 0; i < connectionArray.length; i++)
    {
        connectionArray[i].send(userListMsgStr);
    }
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
        const connect = getConnectionForID(msg.id);

        switch (msg.type)
        {
            case "message":
                msg.name = connect.username;
                msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
                break;
        }


        if (sendToClients)
        {
            const msgString = JSON.stringify(msg);
            let i;

            if (msg.target && msg.target.length !== 0)
            {
                sendToOneUser(msg.target, msgString);
            } else
            {
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
