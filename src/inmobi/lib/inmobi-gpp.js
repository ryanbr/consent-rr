/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The IAB GPP side of the InMobi Choice resource.

    cmp2.js installs window.__gpp itself, draining a stub's queue exactly as it
    drains __tcfapi's, so a script gated on __gpp stalls once cmp2.js is
    replaced and nothing puts one back.

    Section 2, tcfeuv2, is always there: coreConfig.gdprEncodingMode is
    TCF_AND_GPP and the GPP form of a TCF decision is that section, whose
    payload is the TC string itself.

    Section 7, usnat, is added where the tenant runs MSPA - coreConfig's
    mspaJurisdiction, which choice.js hands over, so it is the tenant's own
    answer rather than a guess. Read off cmp2.js' encodeUSString:

      Version                 2, and 16 sensitive-data entries, 3 child ones
      opt-out fields          its own convention is 0 where a value is absent,
                              2 where consented, 1 where not
      MspaCoveredTransaction  coreConfig.isCoveredTransaction ? 1 : 2
      MspaOptOutOptionMode    mspaSignalMode === 'OPT_OUT' ? 1 : 0
      MspaServiceProviderMode 2, flat
      GpcSegmentType          1, and Gpc from navigator.globalPrivacyControl
      base64                  the bit string is padded to a whole byte first,
                              then taken six bits at a time

    Where this deliberately parts from cmp2.js: both of its encodeUSString
    callers pass noticesDefaultValue 2 and opt-outs of 2, because a refusal in
    their TCF banner never reaches usnat - only their MSPA footer link does,
    and GPC. A resource whose whole purpose is to report a refusal cannot
    then say "did not opt out", so the notices are 1 and the opt-outs are 1
    here. Notice given with an opt-out recorded is the pair MSPA's own
    consistency rules expect; notice absent with an opt-out is not.

    The two sections do not say the same thing about advertising, and that is
    on purpose. The TCF section keeps legitimate interest for the purposes the
    tenant's legitimateInterestOptIn asks for - purpose 2 among them, which is
    selecting advertising - while usnat opts out of targeted advertising
    outright. cmp2.js never disagrees with itself there, because it ties both
    to GPC and leaves both permissive without it.

    Keeping that asymmetry is the deliberate choice: MSPA has no
    legitimate-interest basis to keep, so there is nothing in usnat for the
    tenant's LI configuration to be mirrored into - an opt-out is the only
    thing that section can carry. Objecting to LI in the TCF section instead
    would diverge from the tenant's own configuration on the European side,
    and gating usnat on GPC would send "did not opt out" to US vendors for
    every visitor who has not set it, which is the state this section was
    added to stop. GPC still withdraws the TCF legitimate interests, as
    inmobi-tcf.js has it, so a visitor who sends that signal gets both
    sections saying no.

    The header is DBABMA for section 2 alone and DBACMMA for 2 and 7, which is
    what @iabgpp/cmpapi encodes for those section lists. The tests decode what
    this builds with that library and compare section for section, so a drift
    in either shows up.

*/

function consentRRInMobiGpp(tcString, section, coreConfig) {
    const w = window;
    const doc = w.document;
    const CMP_ID = 10;              // InMobi's own id
    const SECTION_ID = 2;
    const SECTION_NAME = 'tcfeuv2';
    const USNAT_ID = 7;
    const USNAT_NAME = 'usnat';
    const HEADER_TCF = 'DBABMA';
    const HEADER_TCF_USNAT = 'DBACMMA';

    const core = coreConfig !== null && typeof coreConfig === 'object'
        ? coreConfig
        : {};

    // Their own two values for the field, and the only ones cmp2.js writes.
    const underMspa = core.mspaJurisdiction === 'NATIONAL' ||
        core.mspaJurisdiction === 'STATE_AND_NATIONAL';

    const B64 =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

    // A segment is padded to a whole byte and then taken six bits at a time,
    // which is why a three-bit GPC segment comes out two characters long.
    const toBase64 = bits => {
        let padded = bits;
        while ( padded.length % 8 !== 0 ) { padded += '0'; }
        while ( padded.length % 6 !== 0 ) { padded += '0'; }
        let out = '';
        for ( let i = 0; i < padded.length; i += 6 ) {
            out += B64.charAt(parseInt(padded.slice(i, i + 6), 2));
        }
        return out;
    };

    const gpcSignal = ( ) => {
        try {
            return w.navigator.globalPrivacyControl === true;
        } catch(ex) {
        }
        return false;
    };

    // Opted out of everything that can be opted out of, with the notices
    // recorded as given - see the note above on parting from cmp2.js here.
    const usnatSection = {
        Version: 2,
        SharingNotice: 1,
        SaleOptOutNotice: 1,
        SharingOptOutNotice: 1,
        TargetedAdvertisingOptOutNotice: 1,
        SensitiveDataProcessingOptOutNotice: 1,
        SensitiveDataLimitUseNotice: 1,
        SaleOptOut: 1,
        SharingOptOut: 1,
        TargetedAdvertisingOptOut: 1,
        SensitiveDataProcessing: [
            1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
        ],
        KnownChildSensitiveDataConsents: [ 1, 1, 1 ],
        PersonalDataConsents: 1,
        MspaCoveredTransaction: core.isCoveredTransaction === true ? 1 : 2,
        MspaOptOutOptionMode: core.mspaSignalMode === 'OPT_OUT' ? 1 : 0,
        MspaServiceProviderMode: 2,
        GpcSegmentType: 1,
        Gpc: gpcSignal(),
    };

    const encodeUsnat = ( ) => {
        let bits = '';
        const push = (value, width) => {
            let out = '';
            for ( let i = width - 1; i >= 0; i-- ) {
                out += (value >> i) & 1;
            }
            bits += out;
        };
        push(usnatSection.Version, 6);
        push(usnatSection.SharingNotice, 2);
        push(usnatSection.SaleOptOutNotice, 2);
        push(usnatSection.SharingOptOutNotice, 2);
        push(usnatSection.TargetedAdvertisingOptOutNotice, 2);
        push(usnatSection.SensitiveDataProcessingOptOutNotice, 2);
        push(usnatSection.SensitiveDataLimitUseNotice, 2);
        push(usnatSection.SaleOptOut, 2);
        push(usnatSection.SharingOptOut, 2);
        push(usnatSection.TargetedAdvertisingOptOut, 2);
        for ( const value of usnatSection.SensitiveDataProcessing ) {
            push(value, 2);
        }
        for ( const value of usnatSection.KnownChildSensitiveDataConsents ) {
            push(value, 2);
        }
        push(usnatSection.PersonalDataConsents, 2);
        push(usnatSection.MspaCoveredTransaction, 2);
        push(usnatSection.MspaOptOutOptionMode, 2);
        push(usnatSection.MspaServiceProviderMode, 2);
        const core64 = toBase64(bits);
        // The segment carries its type and the signal; whether it is included
        // is told by its presence, not by a bit of its own.
        let gpcBits = '';
        gpcBits += '01';
        gpcBits += usnatSection.Gpc ? '1' : '0';
        return core64 + '.' + toBase64(gpcBits);
    };

    const gppString = underMspa
        ? HEADER_TCF_USNAT + '~' + tcString + '~' + encodeUsnat()
        : HEADER_TCF + '~' + tcString;

    const sectionIds = underMspa
        ? [ SECTION_ID, USNAT_ID ]
        : [ SECTION_ID ];
    const supportedApis = underMspa
        ? [ SECTION_ID + ':' + SECTION_NAME, USNAT_ID + ':' + USNAT_NAME ]
        : [ SECTION_ID + ':' + SECTION_NAME ];
    const parsed = underMspa
        ? { tcfeuv2: section, usnat: usnatSection }
        : { tcfeuv2: section };

    // Field for field what the reference implementation answers a ping with.
    const pingData = ( ) => ({
        gppVersion: '1.1',
        cmpStatus: 'loaded',
        cmpDisplayStatus: 'hidden',
        signalStatus: 'ready',
        supportedAPIs: supportedApis,
        cmpId: CMP_ID,
        sectionList: sectionIds,
        applicableSections: sectionIds,
        gppString,
        parsedSections: parsed,
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
        if ( underMspa === false ) { return null; }
        if ( name === USNAT_NAME ) { return usnatSection; }
        if ( Number(name) === USNAT_ID ) { return usnatSection; }
        return null;
    };

    const fieldFrom = path => {
        if ( typeof path !== 'string' ) { return undefined; }
        const pos = path.indexOf('.');
        if ( pos === -1 ) { return undefined; }
        const held = sectionFrom(path.slice(0, pos));
        if ( held === null ) { return undefined; }
        return held[path.slice(pos + 1)];
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
