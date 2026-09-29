/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB GPP side of the Osano resource, which an IAB-enabled bundle carries
    alongside the TCF and US Privacy ones. Their section map is
    { tcfeuv2: 2, tcfcav1: 5, uspv1: 6 }; this reports the two it can build,
    the European TCF section and the US Privacy one, and leaves the Canadian
    one out rather than inventing a string for it.

    The header for those two sections is DBACNYA, which is what @iabgpp/cmpapi
    encodes for a string carrying sections 2 and 6. The payload of each is the
    section's own string, so the whole thing is the header, the TC string and
    the US Privacy string, joined by ~. The tests decode what this builds with
    that library and compare section for section.

    Their own command set is ping, addEventListener, removeEventListener,
    hasSection, getSection and getField, plus a passthrough: a command with a
    dot in it, "uspv1.getUSPData", is routed to that section's own API. That is
    reproduced here. One departure: their hasSection and getSection match on the
    section name only, so a caller passing the number 2 is told no. Both are
    accepted here, because answering a vendor correctly beats reproducing that.

*/

function consentRROsanoGpp(tcf, usp) {
    const w = window;
    const doc = w.document;
    const CMP_ID = 279;             // Osano's own id
    const HEADER = 'DBACNYA';       // sections 2 and 6
    const SECTIONS = [
        { id: 2, name: 'tcfeuv2', parsed: tcf.section, call: tcf.call },
        { id: 6, name: 'uspv1', parsed: usp.section, call: usp.call },
    ];

    const gppString = HEADER + '~' + tcf.tcString + '~' + usp.uspString;

    const sectionIds = SECTIONS.map(entry => entry.id);

    const parsedSections = ( ) => {
        const out = {};
        for ( const entry of SECTIONS ) { out[entry.name] = entry.parsed; }
        return out;
    };

    const pingData = ( ) => ({
        gppVersion: '1.1',
        cmpStatus: 'loaded',
        cmpDisplayStatus: 'hidden',
        signalStatus: 'ready',
        supportedAPIs: SECTIONS.map(entry => entry.id + ':' + entry.name),
        cmpId: CMP_ID,
        sectionList: sectionIds,
        applicableSections: sectionIds,
        gppString,
        parsedSections: parsedSections(),
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
        for ( const entry of SECTIONS ) {
            if ( name === entry.name ) { return entry; }
            if ( Number(name) === entry.id ) { return entry; }
        }
        return null;
    };

    const fieldFrom = path => {
        if ( typeof path !== 'string' ) { return undefined; }
        const pos = path.indexOf('.');
        if ( pos === -1 ) { return undefined; }
        const entry = sectionFrom(path.slice(0, pos));
        if ( entry === null ) { return undefined; }
        return entry.parsed[path.slice(pos + 1)];
    };

    const gppApi = (command, callback, parameter) => {
        // No arguments, or the two names, hand back the arrays a stub keeps.
        if ( command === undefined || command === 'queue' ) {
            return gppApi.queue;
        }
        if ( command === 'events' ) { return gppApi.events; }
        if ( typeof callback !== 'function' ) { return; }
        // Their passthrough: <section>.<command> goes to that section's API.
        if ( typeof command === 'string' && command.indexOf('.') !== -1 ) {
            const pos = command.indexOf('.');
            const entry = sectionFrom(command.slice(0, pos));
            if ( entry === null || typeof entry.call !== 'function' ) {
                callSafely(callback, null, false);
                return;
            }
            entry.call(command.slice(pos + 1), callback, parameter);
            return;
        }
        switch ( command ) {
        case 'ping':
            callSafely(callback, pingData(), true);
            break;
        case 'hasSection':
            callSafely(callback, sectionFrom(parameter) !== null, true);
            break;
        case 'getSection': {
            const entry = sectionFrom(parameter);
            callSafely(
                callback,
                entry !== null ? entry.parsed : null,
                entry !== null
            );
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
            // getGPPData among them: not a command in GPP 1.1, and not one
            // their own switch answers either.
            callSafely(callback, null, false);
            break;
        }
    };

    // Anything a stub parked before the redirect landed.
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
