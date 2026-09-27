/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB GPP side of the InMobi Choice resource.

    cmp2.js installs window.__gpp itself, draining a stub's queue exactly as it
    drains __tcfapi's, so a script gated on __gpp stalls once cmp2.js is
    replaced and nothing puts one back.

    The section is tcfeuv2, section 2, because that is what this tenant asks
    for: coreConfig.gdprEncodingMode is TCF_AND_GPP and the GPP form of a TCF
    decision is that section, whose payload is the TC string itself. The US
    sections are left out rather than guessed: cmp2.js only writes one under
    MSPA, which needs a jurisdiction the page cannot tell us.

    The header is DBABMA, which is what @iabgpp/cmpapi encodes for a string
    carrying section 2 alone. The tests decode what this builds with that
    library and compare section for section, so a drift in either shows up.

*/

function consentRRInMobiGpp(tcString, section) {
    const w = window;
    const doc = w.document;
    const CMP_ID = 10;              // InMobi's own id
    const SECTION_ID = 2;
    const SECTION_NAME = 'tcfeuv2';
    const HEADER = 'DBABMA';

    const gppString = HEADER + '~' + tcString;

    // Field for field what the reference implementation answers a ping with.
    const pingData = ( ) => ({
        gppVersion: '1.1',
        cmpStatus: 'loaded',
        cmpDisplayStatus: 'hidden',
        signalStatus: 'ready',
        supportedAPIs: [ SECTION_ID + ':' + SECTION_NAME ],
        cmpId: CMP_ID,
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
            // getGPPData among them: it is not a command in GPP 1.1, and the
            // reference implementation refuses it too.
            callSafely(callback, null, false);
            break;
        }
    };

    // Anything a stub parked before the redirect landed. cmp2.js reads it by
    // calling __gpp with no arguments, so a stub's queue comes back that way.
    const previous = w.__gpp;
    let queued = [];
    let registered = [];
    if ( typeof previous === 'function' ) {
        try {
            const carried = previous();
            if ( Array.isArray(carried) ) { queued = carried.slice(); }
        } catch(ex) {
        }
        if ( Array.isArray(previous.queue) ) { queued = previous.queue.slice(); }
        if ( Array.isArray(previous.events) ) {
            registered = previous.events.slice();
        }
    }

    gppApi.queue = [];
    gppApi.events = [];
    w.__gpp = gppApi;

    for ( const call of queued ) {
        if ( Array.isArray(call) ) {
            gppApi(call[0], call[1], call[2]);
            continue;
        }
        if ( typeof call !== 'object' || call === null ) { continue; }
        gppApi(call.command, call.callback, call.parameter);
    }
    for ( const entry of registered ) {
        if ( typeof entry !== 'object' || entry === null ) { continue; }
        if ( typeof entry.callback !== 'function' ) { continue; }
        gppApi('addEventListener', entry.callback, entry.parameter);
    }

    const addLocatorFrame = ( ) => {
        try {
            if ( doc.querySelector('iframe[name="__gppLocator"]') !== null ) {
                return;
            }
            const parent = doc.body || doc.documentElement;
            if ( parent === null ) {
                w.setTimeout(addLocatorFrame, 5);
                return;
            }
            const frame = doc.createElement('iframe');
            frame.name = '__gppLocator';
            frame.style.display = 'none';
            frame.setAttribute('aria-hidden', 'true');
            parent.appendChild(frame);
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
