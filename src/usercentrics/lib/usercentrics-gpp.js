/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB GPP side of the Usercentrics resource.

    Their SDK installs window.__gpp through the bundled reference CmpApi, and
    only where the tenant has it on: gppEnabled is a setting, and the API is
    built with the same identity as the TCF one -

      this.cmpId = tcf2.cmpId || 5
      this.cmpVersion = tcf2.cmpVersion || 3
      this.gppApi = new CmpApi(this.cmpId, this.cmpVersion)

    so this is handed the identity the TCF layer resolved rather than one of
    its own. Their stub answers a ping with cmpId 31 and cmpStatus "stub",
    which is the placeholder before that API exists; the loaded API answers
    with the tenant's.

    supportedAPIs is theirs verbatim: 2:tcfeuv2, 5:tcfcav1 and 6:uspv1. What is
    actually carried is section 2 alone, whose payload is the TC string, so
    sectionList and applicableSections name only that. The US and Canadian
    sections are left out rather than guessed: which one applies needs the
    jurisdiction their location lookup returns, and a replaced CMP never makes
    it.

    The header is DBABMA, which is what @iabgpp/cmpapi encodes for a string
    carrying section 2 alone. The tests decode what this builds with that
    library and compare section for section.

*/

function consentRRUsercentricsGpp(tcString, section, cmpId, cmpVersion) {
    const w = window;
    const doc = w.document;
    const SECTION_ID = 2;
    const SECTION_NAME = 'tcfeuv2';
    const HEADER = 'DBABMA';
    // Theirs, in their order.
    const SUPPORTED_APIS = [ '2:tcfeuv2', '5:tcfcav1', '6:uspv1' ];

    const gppString = HEADER + '~' + tcString;

    // Field for field what the reference implementation answers a ping with.
    const pingData = ( ) => ({
        gppVersion: '1.1',
        cmpStatus: 'loaded',
        cmpDisplayStatus: 'hidden',
        signalStatus: 'ready',
        supportedAPIs: SUPPORTED_APIS.slice(),
        cmpId,
        cmpVersion,
        sectionList: [ SECTION_ID ],
        applicableSections: [ SECTION_ID ],
        gppString,
        parsedSections: { tcfeuv2: section },
    });

    const listeners = new Map();
    let nextListenerId = 1;

    const callSafely = (callback, value, success) => {
        try {
            callback(value, success);
        } catch(ex) {
        }
    };

    const sectionFrom = name => {
        if ( name === SECTION_NAME ) { return section; }
        if ( Number(name) === SECTION_ID ) { return section; }
        return null;
    };

    const fieldFrom = path => {
        if ( typeof path !== 'string' ) { return undefined; }
        const pos = path.indexOf('.');
        if ( pos === -1 ) { return undefined; }
        if ( sectionFrom(path.slice(0, pos)) === null ) { return undefined; }
        return section[path.slice(pos + 1)];
    };

    // getGPPData is deliberately absent: it is not a command in GPP 1.1, and
    // the reference implementation refuses it, so this refuses it too.
    const gppApi = (command, callback, parameter) => {
        // No arguments, or the two names, hand back the arrays the stub keeps.
        if ( command === undefined || command === 'queue' ) {
            return gppApi.queue;
        }
        if ( command === 'events' ) { return gppApi.events; }
        if ( typeof callback !== 'function' ) { return; }
        switch ( command ) {
        case 'ping':
            callSafely(callback, pingData(), true);
            break;
        case 'hasSection':
            callSafely(callback, sectionFrom(parameter) !== null, true);
            break;
        case 'getSection': {
            const found = sectionFrom(parameter);
            callSafely(callback, found, found !== null);
            break;
        }
        case 'getField': {
            const value = fieldFrom(parameter);
            if ( value === undefined ) {
                callSafely(callback, null, false);
                break;
            }
            callSafely(callback, value, true);
            break;
        }
        case 'addEventListener': {
            const listenerId = nextListenerId;
            nextListenerId += 1;
            listeners.set(listenerId, callback);
            gppApi.events.push({ id: listenerId, callback, parameter });
            callSafely(callback, {
                eventName: 'listenerRegistered',
                listenerId,
                data: true,
                pingData: pingData(),
            }, true);
            break;
        }
        case 'removeEventListener': {
            const listenerId = Number(parameter);
            const removed = listeners.delete(listenerId);
            callSafely(callback, {
                eventName: 'listenerRemoved',
                listenerId,
                data: removed,
                pingData: pingData(),
            }, removed);
            break;
        }
        default:
            callSafely(callback, null, false);
            break;
        }
    };

    // A stub parks calls on these two, and whatever is already on the page's
    // stub is answered rather than left unread.
    const previous = w.__gpp;
    const queued = [];
    try {
        if ( typeof previous === 'function' ) {
            const parked = previous('queue');
            if ( Array.isArray(parked) ) {
                for ( const call of parked ) { queued.push(call); }
            } else if ( Array.isArray(previous.queue) ) {
                for ( const call of previous.queue ) { queued.push(call); }
            }
        }
    } catch(ex) {
    }

    gppApi.queue = [];
    gppApi.events = [];

    try {
        w.__gpp = gppApi;
    } catch(ex) {
        return '';
    }
    if ( w.__gpp !== gppApi ) { return ''; }

    for ( const call of queued ) {
        if ( Array.isArray(call) === false ) { continue; }
        try {
            gppApi(call[0], call[1], call[2]);
        } catch(ex) {
        }
    }

    // The frame a cross-frame caller looks for, which their own CmpApi adds.
    const addLocatorFrame = ( ) => {
        try {
            if ( w.frames.__gppLocator !== undefined ) { return; }
            if ( doc.body === null ) { return; }
            const frame = doc.createElement('iframe');
            frame.style.display = 'none';
            frame.name = '__gppLocator';
            doc.body.appendChild(frame);
        } catch(ex) {
        }
    };
    addLocatorFrame();

    w.addEventListener('message', ev => {
        let payload = ev.data;
        let wasString = false;
        if ( typeof payload === 'string' ) {
            try {
                payload = JSON.parse(payload);
                wasString = true;
            } catch(ex) {
                return;
            }
        }
        if ( typeof payload !== 'object' || payload === null ) { return; }
        const call = payload.__gppCall;
        if ( typeof call !== 'object' || call === null ) { return; }
        if ( call.callId === undefined ) { return; }
        if ( ev.source === null || ev.source === undefined ) { return; }
        gppApi(call.command, (returnValue, success) => {
            let response = {
                __gppReturn: {
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
            } catch(ex) {
            }
        }, call.parameter);
    });

    return gppString;
}
