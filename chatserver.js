"use strict";

const http = require('http');
require('fs');
const WebSocketServer = require('websocket').server;

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
            connectionArray[i].sendUTF(msgString);
            break;
        }
    }
}

// Scan the list of connections and return the one for the specified
// clientID. Each login gets an ID that doesn't change during the session,
// so it can be tracked across username changes.
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

// Builds a message object of type "userlist" which contains the names of
// all connected users. Used to ramp up newly logged-in users and,
// inefficiently, to handle name change notifications.
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
        connectionArray[i].sendUTF(userListMsgStr);
    }
}

let webServer = http.createServer({}, handleWebRequest);

function handleWebRequest(request, response)
{
    response.writeHead(404);
    response.end();
}

// Spin up the HTTPS server on the port assigned to this sample.
// This will be turned into a WebSocket port very shortly.

webServer.listen(6503, function ()
{
});

// Create the WebSocket server by converting the HTTPS server into one.

const wsServer = new WebSocketServer({
    httpServer: webServer,
    autoAcceptConnections: false
});

// noinspection JSUnresolvedFunction
wsServer.on('request', function (request)
{
    const connection = request.accept("json", request.origin);

    connectionArray.push(connection);

    connection.clientID = nextID;
    nextID++;

    let msg = {
        type: "id",
        id: connection.clientID
    };
    connection.sendUTF(JSON.stringify(msg));

    connection.on('message', function (message)
    {



        let sendToClients = true;
        msg = JSON.parse(message.utf8Data);
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
                    connectionArray[i].sendUTF(msgString);
                }
            }
        }
    });

    // Handle the WebSocket "close" event; this means a user has logged off
    // or has been disconnected.
    connection.on('close', function (reason, description)
    {
        // First, remove the connection from the list of connections.
        connectionArray = connectionArray.filter(function (el)
        {
            return el.connected;
        });

        // Now send the updated user list. Again, please don't do this in a
        // real application. Your users won't like you very much.
        sendUserListToAll();

        // Build and output log output for close information.

        let logMessage = "Connection closed: " + connection.remoteAddress + " (" +
            reason;
        if (description !== null && description.length !== 0)
        {
            logMessage += ": " + description;
        }
        logMessage += ")";
    });
});
