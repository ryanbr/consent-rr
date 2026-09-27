/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB GPP side of both resources, the US counterpart to the TCF one.

    otSDKStub.js installs window.__gpp itself, along with a __gppLocator frame
    and a postMessage bridge, wherever a tenant has the GPP module on. A script
    gated on __gpp therefore waits forever once the stub is replaced - the same
    silent stall a missing __tcfapi caused.

    The section is usnat, section 7, the US national one. Refusing asserts the
    opt-outs; accepting declines them. The Global Privacy Control bit carries
    the browser's own signal either way, since that is a fact about the request
    rather than part of the decision.

    Both halves of the string come from @iabgpp/cmpapi, the IAB's own library,
    encoding exactly the field values below. It is a constant because nothing in
    a usnat section is time-based. The tests regenerate all four combinations
    with that library and fail if these drift.

*/

function consentRRGpp(grant) {
    const w = window;
    const doc = w.document;
    const CMP_ID = 28;              // OneTrust's own id
    const SECTION_ID = 7;
    const SECTION_NAME = 'usnat';
    const gpc = w.navigator.globalPrivacyControl === true;

    const gppString = (grant
        ? 'DBABLA~BVVqqqqqAqA.'
        : 'DBABLA~BVVVVVVVAmA.') + (gpc ? 'YA' : 'QA');

    // 1 is opted out, 2 is did not opt out, 0 is not applicable.
    const optOut = grant ? 2 : 1;
    const sensitive = [];
    for ( let i = 0; i < 12; i++ ) { sensitive.push(optOut); }

    const section = {
        Version: 1,
        SharingNotice: 1,
        SaleOptOutNotice: 1,
        SharingOptOutNotice: 1,
        TargetedAdvertisingOptOutNotice: 1,
        SensitiveDataProcessingOptOutNotice: 1,
        SensitiveDataLimitUseNotice: 1,
        SaleOptOut: optOut,
        SharingOptOut: optOut,
        TargetedAdvertisingOptOut: optOut,
        SensitiveDataProcessing: sensitive,
        KnownChildSensitiveDataConsents: [ 0, 0 ],
        PersonalDataConsents: 0,
        MspaCoveredTransaction: 2,
        MspaOptOutOptionMode: optOut,
        MspaServiceProviderMode: 2,
        GpcSegmentType: 1,
        GpcSegmentIncluded: true,
        Gpc: gpc,
    };

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
        parsedSections: { usnat: section },
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
        const value = section[path.slice(pos + 1)];
        return value;
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

    // Anything a stub parked before the redirect landed. Its queue entries are
    // argument lists, its events entries carry a callback of their own.
    const previous = w.__gpp;
    const carried = typeof previous === 'function' ? previous : {};
    const queued = Array.isArray(carried.queue) ? carried.queue.slice() : [];
    const registered = Array.isArray(carried.events) ? carried.events.slice() : [];

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
