import WebSocket from "ws";

let connectionArray: { id: string, socket: WebSocket }[] = [];
let lianjieid = Date.now();

const WSServer = new WebSocket.Server({port: 6503}, () => console.log('系统启动'));

WSServer.on('connection', function (connection: WebSocket)
{
    // 设定ID
    connectionArray.push({id: lianjieid.toString(), socket: connection});
    connection.send(JSON.stringify({
        type: "id",
        id: lianjieid.toString()
    }));
    lianjieid++;

    console.log('当前连接：', connectionArray.map(value => value.id))

    const userListMsgStr = JSON.stringify({
        type: "userlist",
        users: connectionArray.map(value => value.id)
    });

    connectionArray.forEach(value => value.socket.send(userListMsgStr))

    connection.on('message', function (message: string)
    {
        let msg = JSON.parse(message);
        let conn = connectionArray.filter(value => value.id === msg.target).pop();
        if (conn) conn.socket.send(message)
    });

    connection.on('close', () => connectionArray = connectionArray.filter(el => el.socket !== connection));
});
