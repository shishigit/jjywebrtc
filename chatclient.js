// WebSocket and WebRTC based multi-user chat sample with two-way video
// calling, including use of TURN if applicable or necessary.
//
// This file contains the JavaScript code that implements the client-side
// features for connecting and managing chat and video calls.
//
// To read about how this sample works:  http://bit.ly/webrtc-from-chat
//
// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

"use strict";

// Get our hostname

let myHostname = window.location.hostname;
if (!myHostname)
{
    myHostname = "localhost";
}
log("Hostname: " + myHostname);

// WebSocket chat/signaling channel variables.

let connection = null;
let clientID = 0;

// The media constraints object describes what sort of stream we want
// to request from the local A/V hardware (typically a webcam and
// microphone). Here, we specify only that we want both audio and
// video; however, you can be more specific. It's possible to state
// that you would prefer (or require) specific resolutions of video,
// whether to prefer the user-facing or rear-facing camera (if available),
// and so on.
//
// See also:
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints
// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
//

const mediaConstraints = {
    audio: true,            // We want an audio track
    video: {
        aspectRatio: {
            ideal: 1.333333     // 3:2 aspect is preferred
        }
    }
};

let myUsername = null;
let targetUsername = null;      // To store username of other peer
let myPeerConnection = null;    // RTCPeerConnection
let transceiver = null;         // RTCRtpTransceiver
let webcamStream = null;        // MediaStream from webcam

// Output logging information to console.

function log(text)
{
    const time = new Date();

    console.log("[" + time.toLocaleTimeString() + "] " + text);
}

// Output an error message to console.

function log_error(text)
{
    const time = new Date();

    console.trace("[" + time.toLocaleTimeString() + "] " + text);
}

// Send a JavaScript object by converting it to JSON and sending
// it as a message on the WebSocket connection.

function sendToServer(msg)
{
    const msgJSON = JSON.stringify(msg);

    log("Sending '" + msg.type + "' message: " + msgJSON);
    connection.send(msgJSON);
}

// Called when the "id" message is received; this message is sent by the
// server to assign this login session a unique ID number; in response,
// this function sends a "username" message to set our username for this
// session.
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

// Open and configure the connection to the WebSocket server.

function connect()
{
    const serverUrl = "ws://" + myHostname + ":6503";

    connection = new WebSocket(serverUrl, "json");

    connection.onerror = function (evt)
    {
        console.dir(evt);
    }

    connection.onmessage = async function (evt)
    {
        let text = "";
        const msg = JSON.parse(evt.data);
        log("Message received: ");
        console.dir(msg);
        const time = new Date(msg.date);
        const timeStr = time.toLocaleTimeString();

        switch (msg.type)
        {
            case "id":
                clientID = msg.id;
                setUsername();
                break;

            case "username":
                text = "<b>User <em>" + msg.name + "</em> signed in at " + timeStr + "</b><br>";
                break;

            case "message":
                text = "(" + timeStr + ") <b>" + msg.name + "</b>: " + msg.text + "<br>";
                break;

            case "rejectusername":
                myUsername = msg.name;
                text = "<b>Your username has been set to <em>" + myUsername +
                    "</em> because the name you chose is in use.</b><br>";
                break;

            case "userlist":      // Received an updated user list
                handleUserlistMsg(msg);
                break;

            // Signaling messages: these messages are used to trade WebRTC
            // signaling information during negotiations leading up to a video
            // call.

            case "video-offer":  // Invitation and offer to chat
                await handleVideoOfferMsg(msg);
                break;

            case "video-answer":
                const desc = new RTCSessionDescription(msg.sdp);
                await myPeerConnection.setRemoteDescription(desc);
                break;

            case "new-ice-candidate": // A new ICE candidate has been received
                await handleNewICECandidateMsg(msg);
                break;

            default:
                log_error("Unknown message received:");
                log_error(msg);
        }
    };
}

async function createPeerConnection()
{
    log("Setting up a connection...");


    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls: "turn:" + myHostname,
                username: "webrtc",
                credential: "turnserver"
            }
        ]
    });


    myPeerConnection.onicecandidate = function (event)
    {
        if (event.candidate)
        {
            log("*** Outgoing ICE candidate: " + event.candidate.candidate);

            sendToServer({
                type: "new-ice-candidate",
                target: targetUsername,
                candidate: event.candidate
            });
        }
    }

    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
    myPeerConnection.ontrack = handleTrackEvent;
}

async function handleNegotiationNeededEvent()
{

    log("---> Creating offer");
    const offer = await myPeerConnection.createOffer();

    if (myPeerConnection.signalingState !== "stable")
    {
        log("     -- The connection isn't stable yet; postponing...")
        return;
    }

    log("---> Setting local description to the offer");
    await myPeerConnection.setLocalDescription(offer);

    log("---> Sending the offer to the remote peer");
    sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "video-offer",
        sdp: myPeerConnection.localDescription
    });

}

function handleTrackEvent(event)
{
    log("*** Track event");
    document.getElementById("received_video").srcObject = event.streams[0];
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
    log("Starting to prepare an invitation");
    if (myPeerConnection)
    {
        alert("You can't start a call because you already have one open!");
    } else
    {
        const clickedUsername = evt.target.textContent;

        // Don't allow users to call themselves, because weird.

        if (clickedUsername === myUsername)
        {
            alert("I'm afraid I can't let you talk to yourself. That would be weird.");
            return;
        }

        // Record the username being called for future reference

        targetUsername = clickedUsername;
        log("Inviting user " + targetUsername);

        // Call createPeerConnection() to create the RTCPeerConnection.
        // When this returns, myPeerConnection is our RTCPeerConnection
        // and webcamStream is a stream coming from the camera. They are
        // not linked together in any way yet.

        log("Setting up connection to invite user: " + targetUsername);
        await createPeerConnection();

        // Get access to the webcam stream and attach it to the
        // "preview" box (id "local_video").


        webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        document.getElementById("local_video").srcObject = webcamStream;


        // Add the tracks from the stream to the RTCPeerConnection


        webcamStream.getTracks().forEach(
            transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
        );

    }
}

// Accept an offer to video chat. We configure our local settings,
// create our RTCPeerConnection, get and attach our local camera
// stream, then create and send an answer to the caller.

async function handleVideoOfferMsg(msg)
{
    targetUsername = msg.name;

    // If we're not already connected, create an RTCPeerConnection
    // to be linked to the caller.

    log("Received video chat offer from " + targetUsername);
    if (!myPeerConnection)
    {
        await createPeerConnection();
    }

    // We need to set the remote description to the received SDP offer
    // so that our local WebRTC layer knows how to talk to the caller.

    const desc = new RTCSessionDescription(msg.sdp);

    // If the connection isn't stable yet, wait for it...

    if (myPeerConnection.signalingState !== "stable")
    {
        log("  - But the signaling state isn't stable, so triggering rollback");

        // Set the local and remove descriptions for rollback; don't proceed
        // until both return.
        await Promise.all([
            myPeerConnection.setLocalDescription({type: "rollback"}),
            myPeerConnection.setRemoteDescription(desc)
        ]);
        return;
    } else
    {
        log("  - Setting remote description");
        await myPeerConnection.setRemoteDescription(desc);
    }

    // Get the webcam stream if we don't already have it

    if (!webcamStream)
    {
        webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        document.getElementById("local_video").srcObject = webcamStream;
        webcamStream.getTracks().forEach(
            transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
        );
    }

    log("---> Creating and sending answer to caller");

    await myPeerConnection.setLocalDescription(await myPeerConnection.createAnswer());

    sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "video-answer",
        sdp: myPeerConnection.localDescription
    });
}

// A new ICE candidate has been received from the other peer. Call
// RTCPeerConnection.addIceCandidate() to send it along to the
// local ICE framework.

async function handleNewICECandidateMsg(msg)
{
    const candidate = new RTCIceCandidate(msg.candidate);
    await myPeerConnection.addIceCandidate(candidate)
}
