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
    two. The version test is the one place this does not follow theirs, and
    the install below says why.

    __uspapiPostMessageReady IS SET, because gpt.js installs a bridge of its
    own where it is not: "a.__uspapiPostMessageReady || Yg(new Xg(a))". Two
    bridges answer one call twice, with the same callId. Theirs sets it for
    that reason and so does this.

    NOT SET HERE, BUT HONOURED: window.__uspapiManager. gpt.js writes it when
    it puts up a US privacy API of its own:

        jh = function(a){ !a.u || a.h.__uspapi || a.h.frames.__uspapiLocator ||
            (a.h.__uspapiManager = "fc", gh(a.h, "__uspapiLocator"),
             Aa("__uspapi", ...), Zg(a.h)) }

    and a.u comes out of the FCCDCF proto, the same place its tcString does -
    so where that stand-in got in first, a page is carrying a US privacy
    string read from the cookie this refusal clears, and the marker is how its
    own loader knows such an API is one it may replace. The install below
    reads it for that reason. It is not written: the only reader is their
    loader, and the one way that loader runs with this resource on the page is
    a copy of it proxied past the filter - in which case a refusal already
    standing should not invite itself to be replaced by a prompt.

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

        // Their own re-entry test, marker and all. An API or a locator frame
        // already standing is left alone, so a publisher running its own US
        // flow alongside Funding Choices keeps it - unless it carries the
        // marker, which only a Google stand-in sets, and whose string comes
        // out of the cookie this refusal has just cleared.
        try {
            const standing = typeof w.__uspapi === 'function' ||
                w.frames.__uspapiLocator !== undefined;
            if ( standing && w.__uspapiManager !== 'fc' ) { return false; }
        } catch ( ex ) {
        }

        const api = (command, version, callback) => {
            if ( typeof callback !== 'function' ) { return; }
            // One deliberate divergence from theirs, which compares the
            // version strictly: a caller that sends none at all is answered
            // anyway. gpt.js' own stand-in checks the version not at all and
            // its bridge forwards whatever a caller sent, so refusing one
            // delivers neither the refusal nor the end of the wait - and
            // osano-usp.js reads it the same way. An explicit version that is
            // not 1 is still refused.
            if ( version !== undefined && version !== null &&
                 Number(version) !== 1 ) {
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
