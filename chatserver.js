"use strict";


const WebSocketServer = require('ws');

let connectionArray = [];
let nextID = Date.now();
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

// Sends a message (which is already stringified JSON) to a single
// user, given their username. We use this for the WebRTC signaling,
// and we could use it for private text messaging.
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
    let connect = null;
    let i;

    for (i = 0; i < connectionArray.length; i++)
    {
        if (connectionArray[i].clientID === id)
        {
            connect = connectionArray[i];
            break;
        }
    }

    return connect;
}

function makeUserListMessage()
{
    const userListMsg = {
        type: "userlist",
        users: []
    };
    let i;

    // Add the users to the list

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


const wsServer = new WebSocketServer.Server({port: 6503});

wsServer.on('connection', function (connection)
{
    connectionArray.push(connection);
    connection.clientID = nextID;
    nextID++;

    let msg = {
        type: "id",
        id: connection.clientID
    };
    connection.send(JSON.stringify(msg));

    connection.on('message', function (message)
    {
        let sendToClients = true;
        msg = JSON.parse(message);
        const connect = getConnectionForID(msg.id);

        switch (msg.type)
        {
            case "message":
                msg.name = connect.username;
                msg.text = msg.text.replace(/(<([^>]+)>)/ig, "");
                break;

            case "username":
                let nameChanged = false;
                const origName = msg.name;

                while (!isUsernameUnique(msg.name))
                {
                    msg.name = origName + appendToMakeUnique;
                    appendToMakeUnique++;
                    nameChanged = true;
                }

                if (nameChanged)
                {
                    const changeMsg = {
                        id: msg.id,
                        type: "rejectusername",
                        name: msg.name
                    };
                    // noinspection JSUnresolvedFunction
                    connect.sendUTF(JSON.stringify(changeMsg));
                }

                connect.username = msg.name;
                sendUserListToAll();
                sendToClients = false;
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
