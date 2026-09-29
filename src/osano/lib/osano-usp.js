/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB US Privacy side of the Osano resource.

    osano.js carries this API in the bundle itself - the file ends by
    initialising with { usp: ... } - so it installs window.__uspapi, a
    __uspapiLocator frame and the postMessage bridge wherever a tenant has
    do-not-sell on. Replacing the script without putting one back leaves
    anything gated on __uspapi waiting, the same stall a missing __tcfapi
    causes elsewhere in this repo.

    Their own encoder is the source of the string. Where CCPA does not apply it
    writes the version, then a dash, then Y if the opt-out signal is on and a
    dash if it is not, then a dash. So 1--- normally, and 1-Y- when the browser
    sends Global Privacy Control - the one input their code turns into an
    opt-out by itself. Whether CCPA applies at all comes from a location lookup,
    so it is not claimed here.

    Their commands are getUSPData, getField and getSection, which is one more
    than the published API has, and getField answers with the characters of the
    string rather than with booleans.

*/

function consentRROsanoUsp(gpc) {
    const w = window;
    const doc = w.document;
    const uspString = '1-' + (gpc ? 'Y' : '-') + '-';

    const uspData = ( ) => ({ version: 1, uspString });

    const fieldFrom = name => {
        switch ( name ) {
        case 'Version':
            return 1;
        case 'Notice':
            return uspString.charAt(1);
        case 'OptOutSale':
            return uspString.charAt(2);
        case 'LspaCovered':
            return uspString.charAt(3);
        default:
            return undefined;
        }
    };

    const uspApi = (command, version, callback, parameter) => {
        if ( version !== undefined && version !== null && Number(version) !== 1 ) {
            if ( typeof callback === 'function' ) { callback(null, false); }
            return;
        }
        switch ( command ) {
        case 'getUSPData':
            if ( typeof callback !== 'function' ) { return; }
            callback(uspData(), true);
            return;
        case 'getField':
            return fieldFrom(parameter);
        case 'getSection':
            return [ uspData() ];
        default:
            if ( typeof callback === 'function' ) { callback(null, false); }
            return;
        }
    };

    w.__uspapi = uspApi;

    const addLocatorFrame = ( ) => {
        try {
            if ( doc.querySelector('iframe[name="__uspapiLocator"]') !== null ) {
                return;
            }
            const parent = doc.body || doc.documentElement;
            if ( parent === null ) {
                w.setTimeout(addLocatorFrame, 5);
                return;
            }
            const frame = doc.createElement('iframe');
            frame.name = '__uspapiLocator';
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
        const call = payload.__uspapiCall;
        if ( typeof call !== 'object' || call === null ) { return; }
        if ( call.callId === undefined ) { return; }
        if ( ev.source === null || ev.source === undefined ) { return; }
        uspApi(call.command, call.version, (returnValue, success) => {
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
            } catch(ex) {
            }
        }, call.parameter);
    });

    return uspString;
}
