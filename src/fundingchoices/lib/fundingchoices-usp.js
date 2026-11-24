/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB US Privacy side of the Funding Choices resource.

    Their script carries it. The loader installs window.__uspapi, a
    __uspapiLocator frame and the postMessage bridge wherever a publisher's US
    flow is on, and marks the API as its own with window.__uspapiManager set
    to "fc" - that marker being the one thing it will overwrite an API already
    standing for. Replacing the script without putting one back leaves
    anything gated on __uspapi waiting, which is the stall a missing __tcfapi
    causes elsewhere in this repo.

    BOTH OF GOOGLE'S OWN READERS ASK FOR IT: gpt.js and adsbygoogle.js each
    call getUSPData and read uspString, ten references apiece, and each falls
    back to 1--- when nothing answers. That is "not applicable", not an
    opt-out, so the API being absent is not the stricter state.

    THE STRING IS 1-Y- WHERE THE BROWSER SENDS GLOBAL PRIVACY CONTROL AND 1---
    OTHERWISE, which is what osano-usp.js and inmobi-core.js answer, on the
    same reasoning: whether CCPA applies at all comes from a location lookup a
    page does not have, so the notice and LSPA characters stay dashes rather
    than claim something about the publisher's notice. The middle one is not a
    claim about jurisdiction either - it is the visitor's own signal, and
    Global Privacy Control is the one input that is an opt-out by itself.
    Brave sends it by default; elsewhere it is off unless the visitor turns it
    on.

    THEIR CONTRACT, measured off the script fundingchoicesmessages.google.com
    serves, which is one command rather than the three Osano's bundle has:

        c !== 1 ? d(null, !1)
                : b === "getUSPData" && ((b = _.oq(e.j))
                    ? d({version: 1, uspString: b}, !0)
                    : d(null, !1))

    So a version that is not exactly 1 is answered (null, false), getUSPData
    is answered ({version: 1, uspString}, true), and any other command gets
    silence - the same silence their __fci queue gives a command outside its
    two.

    __uspapiPostMessageReady IS SET, because gpt.js installs a bridge of its
    own where it is not: "a.__uspapiPostMessageReady || Yg(new Xg(a))". Two
    bridges answer one call twice, with the same callId. Theirs sets it for
    that reason and so does this.

    NOT DONE HERE: window.__uspapiManager. The only thing that reads it is
    their own loader, deciding whether an API already up is one it may
    replace, and that loader is the thing being stood in for.

*/

function consentRRFundingChoicesUsp(whenBody) {
    const w = window;

    const gpc = ( ) => {
        try {
            return w.navigator.globalPrivacyControl === true;
        } catch ( ex ) {
        }
        return false;
    };

    const uspString = '1-' + (gpc() ? 'Y' : '-') + '-';

    const install = ( ) => {
        const doc = w.document;

        // Their own re-entry test, less the marker: an API or a locator
        // already standing is left alone, so a publisher running its own US
        // flow alongside Funding Choices keeps it.
        try {
            if ( typeof w.__uspapi === 'function' ) { return false; }
            if ( w.frames.__uspapiLocator !== undefined ) { return false; }
        } catch ( ex ) {
        }

        const api = (command, version, callback) => {
            if ( typeof callback !== 'function' ) { return; }
            // Theirs compares the version strictly, so a string 1 is not 1.
            if ( version !== 1 ) {
                callback(null, false);
                return;
            }
            // Silence for anything else, which is theirs.
            if ( command !== 'getUSPData' ) { return; }
            callback({ version: 1, uspString }, true);
        };

        try {
            w.__uspapi = api;
        } catch ( ex ) {
            return false;
        }
        if ( w.__uspapi !== api ) { return false; }

        // The frame a cross-frame caller looks for. There is no body yet
        // where this runs at document_start, so the append waits for one on
        // the wait the core hands in - the one the googlefc iframes are
        // already on.
        const addLocator = ( ) => {
            try {
                if ( w.frames.__uspapiLocator !== undefined ) { return; }
                if ( doc.body === null ) {
                    w.setTimeout(addLocator, 5);
                    return;
                }
                const frame = doc.createElement('iframe');
                frame.style.cssText = 'display:none';
                frame.name = '__uspapiLocator';
                doc.body.appendChild(frame);
            } catch ( ex ) {
            }
        };
        if ( typeof whenBody === 'function' ) {
            whenBody(addLocator);
        } else {
            addLocator();
        }

        w.addEventListener('message', ev => {
            let payload = ev.data;
            let wasString = false;
            if ( typeof payload === 'string' ) {
                // Ad frames chatter in string messages for the whole life of
                // a page, and a call carries this key, so a string without it
                // is not one and is not worth parsing.
                if ( payload.indexOf('__uspapiCall') === -1 ) { return; }
                try {
                    payload = JSON.parse(payload);
                    wasString = true;
                } catch ( ex ) {
                    return;
                }
            }
            if ( typeof payload !== 'object' || payload === null ) { return; }
            const call = payload.__uspapiCall;
            if ( typeof call !== 'object' || call === null ) { return; }
            if ( call.callId === undefined ) { return; }
            if ( ev.source === null || ev.source === undefined ) { return; }
            api(call.command, call.version, (returnValue, success) => {
                let response = {
                    __uspapiReturn: {
                        returnValue,
                        success,
                        callId: call.callId,
                    },
                };
                if ( wasString ) { response = JSON.stringify(response); }
                try {
                    ev.source.postMessage(
                        response,
                        ev.origin === 'null' ? '*' : ev.origin
                    );
                } catch ( ex ) {
                }
            });
        });

        try {
            w.__uspapiPostMessageReady = true;
        } catch ( ex ) {
        }

        return true;
    };

    return { uspString, install };
}
