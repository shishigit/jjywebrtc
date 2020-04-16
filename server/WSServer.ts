import WebSocket from "ws";

let suoyoulianjie: { id: string, socket: WebSocket }[] = [];
let lianjieid = Date.now();

const WSServer = new WebSocket.Server({port: 6503}, () => console.log('系统启动'));

WSServer.on('connection', function (connection: WebSocket)
{
    // 设定ID
    lianjieid++;
    suoyoulianjie.push({id: lianjieid.toString(), socket: connection});
    connection.send(JSON.stringify({
        type: "id",
        id: lianjieid.toString()
    }));

    // 当前链接
    console.log('当前连接：', suoyoulianjie.map(value => value.id))
    const userListMsgStr = JSON.stringify({
        type: "userlist",
        users: suoyoulianjie.map(value => value.id)
    });
    suoyoulianjie.forEach(value => value.socket.send(userListMsgStr))

    // 信息处理
    connection.on('message', function (message: string)
    {
        let msg = JSON.parse(message);
        let conn = suoyoulianjie.filter(value => value.id === msg.target).pop();
        if (conn) conn.socket.send(message)
    });

    connection.on('close', () => suoyoulianjie = suoyoulianjie.filter(el => el.socket !== connection));
});
