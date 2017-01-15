'use strict';
var crypto = require('crypto');
var http = require('http');

var services = {"36235627": {"23": true, "27": true}, "36235628": {"8": true}};

// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: 'PlainText',
            text: output,
        },
        card: {
            type: 'Simple',
            title: `SessionSpeechlet - ${title}`,
            content: `SessionSpeechlet - ${output}`,
        },
        reprompt: {
            outputSpeech: {
                type: 'PlainText',
                text: repromptText,
            },
        },
        shouldEndSession,
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: '1.0',
        sessionAttributes,
        response: speechletResponse,
    };
}

// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    const sessionAttributes = {};
    const cardTitle = 'Welcome';
    const speechOutput = 'Hello. This is Mr. Bus. ' +
        'You can ask me when the next bus is due.';
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    const repromptText = 'Go on, ask me when the next bus is leaving.';
    const shouldEndSession = false;

    callback(sessionAttributes,
        buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

function handleSessionEndRequest(callback) {
    const cardTitle = 'Session Ended';
    const speechOutput = "I'll be here next time!";
    // Setting this to true ends the session and exits the skill.
    const shouldEndSession = true;

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession));
}

function readTimes(intent, session, callback, response) {

    const cardTitle = 'Bus times';
    const shouldEndSession = true;
    var speechOutput = "";

    for (var i = 0; i < response['busTimes'].length; i++) {
        var bus = response['busTimes'][i];
        var number = bus['mnemoService'];
        var stop = bus['stopId'];
        if (services[stop][number]) {
            speechOutput += "There's a "+number+" in "
            for (var j = 0; j < bus['timeDatas'].length; j++) {
                var departure = bus['timeDatas'][j];
                var minutes = departure['minutes'];
                if (minutes < 60) {
                    speechOutput += minutes;
                    if (j < (bus['timeDatas'].length - 1)) {
                        speechOutput += " and ";
                    }
                }
            }
            speechOutput += " minutes. "
        }
    }

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession));
}

function getBusTimes(intent, session, callback) {
    console.log('getBusTimes called');
    const repromptText = null;
    const sessionAttributes = {};
    let shouldEndSession = false;
    let speechOutput = '';

    var md5sum = crypto.createHash('md5');

    var time = new Date().toISOString().replace(/T/, '').replace(/-/g, '').replace(/:.+/, '');

    console.log('time: '+time);

    md5sum.update(process.env.API_KEY+time);

    var key = md5sum.digest('hex');

    console.log('key: '+key);

    var stops = [];
    var stopIds = Object.keys(services);

    for (var i = 0; i < stopIds.length; i++) {
        stops.push("stopId"+(i+1)+"="+stopIds[i]);
    }

    var options = {
        hostname: 'ws.mybustracker.co.uk',
        port: 80,
        path: '/?module=json&function=getBusTimes&key='+key+'&'+stops.join('&'),
        method: 'GET'
    };

    var responseData = '';

    var req = http.request(options, (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            console.log("got response: "+chunk);
            responseData += chunk;
        });
        res.on('end', () => {
            var json = JSON.parse(responseData);
            console.log('request completed: '+json);
            callback(sessionAttributes, readTimes(intent, session, callback, json));
        });
    });

    req.end();
}

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log(`onSessionStarted requestId=${sessionStartedRequest.requestId}, sessionId=${session.sessionId}`);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log(`onLaunch requestId=${launchRequest.requestId}, sessionId=${session.sessionId}`);

    // Dispatch to your skill's launch.
    getBusTimes(null, null, callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log(`onIntent requestId=${intentRequest.requestId}, sessionId=${session.sessionId}`);

    const intent = intentRequest.intent;
    const intentName = intentRequest.intent.name;

    // Dispatch to your skill's intent handlers
    if (intentName === 'GetBusTimes') {
        getBusTimes(intent, session, callback);
    } else if (intentName === 'AMAZON.HelpIntent') {
        getWelcomeResponse(callback);
    } else if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
        handleSessionEndRequest(callback);
    } else {
        throw new Error('Invalid intent: ');
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log(`onSessionEnded requestId=${sessionEndedRequest.requestId}, sessionId=${session.sessionId}`);
}

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = (event, context, callback) => {
    try {
        console.log(`event.session.application.applicationId=${event.session.application.applicationId}`);

        if (event.session.new) {
            onSessionStarted({ requestId: event.request.requestId }, event.session);
        }

        if (event.request.type === 'LaunchRequest') {
            onLaunch(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'IntentRequest') {
            onIntent(event.request,
                event.session,
                (sessionAttributes, speechletResponse) => {
                    callback(null, buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === 'SessionEndedRequest') {
            onSessionEnded(event.request, event.session);
            callback();
        }
    } catch (err) {
        callback(err);
    }
};
