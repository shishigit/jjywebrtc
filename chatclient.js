"use strict";

let connection = null;
let clientID = 0;

let myUsername = null;
let targetUsername = null;      // To store username of other peer
let peerConnection = null;    // RTCPeerConnection
let transceiver = null;         // RTCRtpTransceiver
let webcamStream = null;        // MediaStream from webcam


function sendToServer(msg)
{
    const msgJSON = JSON.stringify(msg);

    connection.send(msgJSON);
}

function setUsername()
{
    myUsername = document.getElementById("name").value;

    sendToServer({
        name: myUsername,
        date: Date.now(),
        id: clientID,
        type: "username"
    });
}

function connect()
{
    const serverUrl = "ws://" + window.location.hostname + ":6503";

    connection = new WebSocket(serverUrl, "json");

    connection.onerror = function (evt)
    {
        console.dir(evt);
    }

    connection.onmessage = async function (evt)
    {
        const msg = JSON.parse(evt.data);
        console.dir(msg);

        switch (msg.type)
        {
            case "id":
                clientID = msg.id;
                setUsername();
                break;

            case "userlist":
                handleUserlistMsg(msg);
                break;

            case "video-offer":
                await handleVideoOfferMsg(msg);
                break;

            case "video-answer":
                const desc = new RTCSessionDescription(msg.sdp);
                await peerConnection.setRemoteDescription(desc);
                break;

            case "new-ice-candidate":
                const candidate = new RTCIceCandidate(msg.candidate);
                await peerConnection.addIceCandidate(candidate)
                break;

            default:
                console.error('未处理的信息：', msg)
        }
    };
}

async function createPeerConnection()
{
    peerConnection = new RTCPeerConnection();

    peerConnection.onicecandidate = function (event)
    {
        if (event.candidate)
        {
            sendToServer({
                type: "new-ice-candidate",
                target: targetUsername,
                candidate: event.candidate
            });
        }
    }

    peerConnection.onnegotiationneeded = async function ()
    {
        const offer = await peerConnection.createOffer();

        if (peerConnection.signalingState !== "stable")
        {
            return;
        }

        await peerConnection.setLocalDescription(offer);

        sendToServer({
            name: myUsername,
            target: targetUsername,
            type: "video-offer",
            sdp: peerConnection.localDescription
        });
    }

    peerConnection.ontrack = function (event)
    {
        document.getElementById("received_video").srcObject = event.streams[0];
    }
}

function handleUserlistMsg(msg)
{
    const listElem = document.querySelector(".userlistbox");

    while (listElem.firstChild)
    {
        listElem.removeChild(listElem.firstChild);
    }

    msg.users.forEach(function (username)
    {
        const item = document.createElement("li");
        item.appendChild(document.createTextNode(username));
        item.addEventListener("click", invite, false);
        listElem.appendChild(item);
    });
}

async function invite(evt)
{
    targetUsername = evt.target.textContent;
    await createPeerConnection();
    webcamStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    document.getElementById("local_video").srcObject = webcamStream;
    webcamStream.getTracks().forEach(
        transceiver = track => peerConnection.addTransceiver(track, {streams: [webcamStream]})
    );
}

async function handleVideoOfferMsg(msg)
{
    targetUsername = msg.name;

    if (!peerConnection)
    {
        await createPeerConnection();
    }

    const desc = new RTCSessionDescription(msg.sdp);


    if (peerConnection.signalingState !== "stable")
    {
        await Promise.all([
            peerConnection.setLocalDescription({type: "rollback"}),
            peerConnection.setRemoteDescription(desc)
        ]);
        return;
    }
    await peerConnection.setRemoteDescription(desc);


    if (!webcamStream)
    {
        webcamStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
        document.getElementById("local_video").srcObject = webcamStream;
        webcamStream.getTracks().forEach(
            transceiver = track => peerConnection.addTransceiver(track, {streams: [webcamStream]})
        );
    }


    await peerConnection.setLocalDescription(await peerConnection.createAnswer());

    sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "video-answer",
        sdp: peerConnection.localDescription
    });
}
