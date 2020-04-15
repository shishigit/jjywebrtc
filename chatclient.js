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

    connection.onopen = function ()
    {
        document.getElementById("text").disabled = false;
        document.getElementById("send").disabled = false;
    };

    connection.onerror = function (evt)
    {
        console.dir(evt);
    }

    connection.onmessage = async function (evt)
    {
        const chatBox = document.querySelector(".chatbox");
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

            case "video-answer":  // Callee has answered our offer
                await handleVideoAnswerMsg(msg);
                break;

            case "new-ice-candidate": // A new ICE candidate has been received
                await handleNewICECandidateMsg(msg);
                break;

            case "hang-up": // The other peer has hung up the call
                handleHangUpMsg();
                break;

            // Unknown message; output to console for debugging.

            default:
                log_error("Unknown message received:");
                log_error(msg);
        }

        // If there's text to insert into the chat buffer, do so now, then
        // scroll the chat panel so that the new text is visible.

        if (text.length)
        {
            chatBox.innerHTML += text;
            chatBox.scrollTop = chatBox.scrollHeight - chatBox.clientHeight;
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
    log("*** Negotiation needed");

    try
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
    } catch (err)
    {
        log("*** The following error occurred while handling the negotiationneeded event:");
        reportError(err);
    }
}

function handleTrackEvent(event)
{
    log("*** Track event");
    document.getElementById("received_video").srcObject = event.streams[0];
    document.getElementById("hangup-button").disabled = false;
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

function closeVideoCall()
{
    const localVideo = document.getElementById("local_video");

    log("Closing the call");


    if (myPeerConnection)
    {
        log("--> Closing the peer connection");

        myPeerConnection.ontrack = null;
        myPeerConnection.onnicecandidate = null;
        myPeerConnection.oniceconnectionstatechange = null;
        myPeerConnection.onsignalingstatechange = null;
        myPeerConnection.onicegatheringstatechange = null;
        myPeerConnection.onnotificationneeded = null;

        // Stop all transceivers on the connection

        myPeerConnection.getTransceivers().forEach(transceiver =>
        {
            transceiver.stop();
        });

        // Stop the webcam preview as well by pausing the <video>
        // element, then stopping each of the getUserMedia() tracks
        // on it.

        if (localVideo.srcObject)
        {
            localVideo.pause();
            localVideo.srcObject.getTracks().forEach(track =>
            {
                track.stop();
            });
        }

        // Close the peer connection

        myPeerConnection.close();
        myPeerConnection = null;
        webcamStream = null;
    }

    // Disable the hangup button

    document.getElementById("hangup-button").disabled = true;
    targetUsername = null;
}

// Handle the "hang-up" message, which is sent if the other peer
// has hung up the call or otherwise disconnected.

function handleHangUpMsg()
{
    log("*** Received hang up notification from other peer");

    closeVideoCall();
}

// Hang up the call by closing our end of the connection, then
// sending a "hang-up" message to the other peer (keep in mind that
// the signaling is done on a different connection). This notifies
// the other peer that the connection should be terminated and the UI
// returned to the "no call in progress" state.

function hangUpCall()
{
    closeVideoCall();

    sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "hang-up"
    });
}

// Handle a click on an item in the user list by inviting the clicked
// user to video chat. Note that we don't actually send a message to
// the callee here -- calling RTCPeerConnection.addTrack() issues
// a |notificationneeded| event, so we'll let our handler for that
// make the offer.

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

        try
        {
            webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            document.getElementById("local_video").srcObject = webcamStream;
        } catch (err)
        {
            handleGetUserMediaError(err);
            return;
        }

        // Add the tracks from the stream to the RTCPeerConnection

        try
        {
            webcamStream.getTracks().forEach(
                transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
            );
        } catch (err)
        {
            handleGetUserMediaError(err);
        }
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
        try
        {
            webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        } catch (err)
        {
            handleGetUserMediaError(err);
            return;
        }

        document.getElementById("local_video").srcObject = webcamStream;

        // Add the camera stream to the RTCPeerConnection

        try
        {
            webcamStream.getTracks().forEach(
                transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
            );
        } catch (err)
        {
            handleGetUserMediaError(err);
        }
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

// Responds to the "video-answer" message sent to the caller
// once the callee has decided to accept our request to talk.

async function handleVideoAnswerMsg(msg)
{
    log("*** Call recipient has accepted our call");

    // Configure the remote description, which is the SDP payload
    // in our "video-answer" message.

    const desc = new RTCSessionDescription(msg.sdp);
    await myPeerConnection.setRemoteDescription(desc).catch(reportError);
}

// A new ICE candidate has been received from the other peer. Call
// RTCPeerConnection.addIceCandidate() to send it along to the
// local ICE framework.

async function handleNewICECandidateMsg(msg)
{
    const candidate = new RTCIceCandidate(msg.candidate);

    log("*** Adding received ICE candidate: " + JSON.stringify(candidate));
    try
    {
        await myPeerConnection.addIceCandidate(candidate)
    } catch (err)
    {
        reportError(err);
    }
}

// Handle errors which occur when trying to access the local media
// hardware; that is, exceptions thrown by getUserMedia(). The two most
// likely scenarios are that the user has no camera and/or microphone
// or that they declined to share their equipment when prompted. If
// they simply opted not to share their media, that's not really an
// error, so we won't present a message in that situation.

function handleGetUserMediaError(e)
{
    log_error(e);
    switch (e.name)
    {
        case "NotFoundError":
            alert("Unable to open your call because no camera and/or microphone" +
                "were found.");
            break;
        case "SecurityError":
        case "PermissionDeniedError":
            // Do nothing; this is the same as the user canceling the call.
            break;
        default:
            alert("Error opening your camera and/or microphone: " + e.message);
            break;
    }

    // Make sure we shut down our end of the RTCPeerConnection so we're
    // ready to try again.

    closeVideoCall();
}

// Handles reporting errors. Currently, we just dump stuff to console but
// in a real-world application, an appropriate (and user-friendly)
// error message should be displayed.

function reportError(errMessage)
{
    log_error(`Error ${errMessage.name}: ${errMessage.message}`);
}
