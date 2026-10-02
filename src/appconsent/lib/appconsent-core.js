/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Stands in for AppConsent's core.bundle.js, which is their whole CMP: the
    TCF API with the IAB's own cmpapi embedded, their own state, and the loader
    for the banner chunks it fetches afterwards. Replacing the core means those
    chunks are never asked for.

    Read off that bundle rather than from documentation:

      localStorage.appconsent    their own state, JSON. A real one, captured
                                 from a site after accepting, reads
                                   { consents: { consentables: [ { id, iab_id,
                                     name: { values: { en: ... } },
                                     vendors_number, status, legintStatus,
                                     type } ], vendors: [ ... ] } }
                                 with their own status enum - ALLOWED 1,
                                 PENDING 0, DISALLOWED -1, MIXED 2 - and a
                                 validator in the bundle that insists a status
                                 is -1, 0 or 1. type 0 is a purpose and type 2
                                 a special feature, 1 a feature and 3 a
                                 special purpose - a real accepted state
                                 carries all four. legintStatus -1 is "not
                                 applicable" and appears against far more than
                                 the purposes their [1,3,4,5,6] names: in an
                                 accepted state it sits on features, special
                                 purposes and special features too. So a -1 is
                                 never turned into a yes here, whatever the
                                 entry is: their own accepted record does not
                                 claim one, and inventing applicability is not
                                 this resource's business.
      the IABTCF_ keys           the standard set, in localStorage, each a
                                 string of "0" and "1" built by their
                                 lt(set, length)
      __tcfapi                   the embedded cmpapi, with the locator frame
                                 and the queue a stub keeps
      cmpId 2                    hard-coded in their TC model builder
      their manager's methods    init, startCMP, initIAB, setConfiguration,
                                 update, updateExtraPurpose, show, noShow,
                                 presentNotice, retryShow, accept, deny,
                                 fakedeny, setExternalIds, getExternalIds,
                                 getUuid, isFloatingNeedUpdate and
                                 extraFloatingAllowed. Those are the names, so
                                 those are what the global answers; an earlier
                                 pass put eleven methods there of which eight
                                 appear nowhere in their bundle.

    Their state is rewritten where the visitor already has one, and only
    then: every consentable and every vendor in it takes the mode's status,
    and a legitimate interest already marked not-applicable stays that way.
    The list itself cannot be invented - the consentables come back with the
    configuration this never fetches - so a first visit leaves the key alone
    and the answer lives in the IABTCF_ keys and in __tcfapi, which is where a
    vendor looks. An earlier pass wrote hasConsent and consentedAll into that
    key; neither field appears anywhere in their bundle.

    Two modes, one line apart:

      appconsent-reject.js       nothing consented. The default, and what a
                                 refusal looks like.
      appconsent-accept.js       everything consented - every purpose, every
                                 legitimate interest, both special features,
                                 every vendor up to the 4000 their own cap
                                 falls back to, and the publisher purposes.
                                 It is for a site that makes a refusal cost
                                 something: a consent-or-pay wall checks the
                                 answer and keeps the page shut otherwise. A
                                 vendor handed that string is entitled to act
                                 on it, which is the trade being made.

*/

function consentRRAppConsent(grantAll) {
    const w = window;
    const doc = w.document;
    const VERSION = '@@VERSION@@';
    const NAME = grantAll === true ? 'appconsent-accept' : 'appconsent-reject';

    if ( w.__tcfapi !== undefined && w.__tcfapi !== null ) {
        if ( w.__tcfapi.consentRR !== undefined ) { return; }
    }

    const TC_KEY = 'IABTCF_TCString';
    const STATE = 'appconsent';
    // Their enum: p = { MIXED: 2, ALLOWED: 1, PENDING: 0, DISALLOWED: -1 },
    // and their own validator refuses anything but -1, 0 and 1.
    const ALLOWED = 1;
    const DISALLOWED = -1;
    // legintStatus -1 means two different things depending on the record it
    // is in: not-applicable in an accepted one, refused in a refused one. So
    // granting from a refused record cannot tell from the field alone which
    // entries could carry a legitimate interest.
    //
    // For purposes it does not have to: which ones may be taken on legitimate
    // interest is TCF policy rather than a tenant's data, and it is 2, 7, 8,
    // 9, 10 and 11 - exactly where a real accepted record carries a yes.
    // Everything else keeps whatever it had, because their own representation
    // of features, special purposes and special features is theirs to state
    // and only that record knows it.
    const PURPOSE = 0;
    const LEGITIMATE_INTEREST_PURPOSES = [ 2, 7, 8, 9, 10, 11 ];

    const read = name => {
        try {
            const value = w.localStorage.getItem(name);
            return typeof value === 'string' && value !== '' ? value : '';
        } catch(ex) {
        }
        return '';
    };

    const language = ( ) => {
        try {
            const lang = doc.documentElement.lang;
            if ( typeof lang === 'string' && lang !== '' ) { return lang; }
        } catch(ex) {
        }
        try {
            return w.navigator.language || 'fr';
        } catch(ex) {
        }
        return 'fr';
    };

    const tcf = consentRRAppConsentTcf(grantAll, read(TC_KEY), language());

    // The keys they keep in localStorage, with their names and their encoding.
    const store = ( ) => {
        const entries = tcf.storageEntries();
        let wrote = 0;
        for ( const name of Object.keys(entries) ) {
            try {
                w.localStorage.setItem(name, String(entries[name]));
                wrote += 1;
            } catch(ex) {
            }
        }
        return wrote;
    };

    const stored = store();

    // Rewrite what is there rather than invent a list: the consentables come
    // back with their configuration, which a replaced bundle never fetches.
    const restate = ( ) => {
        let state;
        try {
            const raw = read(STATE);
            if ( raw === '' ) { return 'absent'; }
            state = JSON.parse(raw);
        } catch(ex) {
            return 'absent';
        }
        if ( state === null || typeof state !== 'object' ) { return 'absent'; }
        const consents = state.consents;
        if ( consents === null || typeof consents !== 'object' ) {
            return 'absent';
        }
        const status = tcf.granted ? ALLOWED : DISALLOWED;
        let touched = 0;
        const restamp = entry => {
            if ( entry === null || typeof entry !== 'object' ) { return; }
            entry.status = status;
            if ( entry.legintStatus !== undefined ) {
                if ( tcf.granted === false ) {
                    entry.legintStatus = DISALLOWED;
                } else {
                    const policy = entry.type === PURPOSE &&
                        LEGITIMATE_INTEREST_PURPOSES.indexOf(entry.iab_id) !== -1;
                    const had = entry.legintStatus !== DISALLOWED;
                    entry.legintStatus = policy || had
                        ? ALLOWED
                        : DISALLOWED;
                }
            }
            touched += 1;
        };
        try {
            if ( Array.isArray(consents.consentables) ) {
                for ( const entry of consents.consentables ) { restamp(entry); }
            }
            if ( Array.isArray(consents.vendors) ) {
                for ( const entry of consents.vendors ) { restamp(entry); }
            }
            if ( touched === 0 ) { return 'absent'; }
            w.localStorage.setItem(STATE, JSON.stringify(state));
            return (tcf.granted ? 'granted ' : 'denied ') + touched;
        } catch(ex) {
        }
        return 'refused';
    };

    const restated = restate();

    const listeners = new Map();
    let nextId = 0;

    const api = (command, version, callback, parameter) => {
        if ( typeof callback !== 'function' ) { return; }
        if ( command === 'ping' ) {
            callback({
                gdprApplies: true,
                cmpLoaded: true,
                cmpStatus: 'loaded',
                displayStatus: 'hidden',
                apiVersion: '2',
                cmpVersion: tcf.cmpVersion,
                cmpId: tcf.cmpId,
                gvlVersion: 178,
                tcfPolicyVersion: 5,
            }, true);
            return;
        }
        if ( command === 'getTCData' ) {
            callback(tcf.tcData(), true);
            return;
        }
        if ( command === 'addEventListener' ) {
            nextId += 1;
            listeners.set(nextId, callback);
            const data = tcf.tcData();
            data.listenerId = nextId;
            callback(data, true);
            return;
        }
        if ( command === 'removeEventListener' ) {
            const existed = listeners.delete(parameter);
            callback(existed, existed);
            return;
        }
        callback(null, false);
    };
    api.consentRR = VERSION;

    // A publisher's stub parks calls until a CMP arrives, and their cmpapi
    // drains them.
    const drain = ( ) => {
        let queued = [];
        try {
            const stub = w.__tcfapi;
            if ( typeof stub === 'function' ) {
                const parked = stub();
                if ( Array.isArray(parked) ) { queued = parked.slice(); }
            }
        } catch(ex) {
        }
        return queued;
    };

    const queued = drain();

    let installed = false;
    try {
        w.__tcfapi = api;
        installed = w.__tcfapi === api;
    } catch(ex) {
    }

    let answered = 0;
    for ( const call of queued ) {
        if ( Array.isArray(call) === false ) { continue; }
        try {
            api(call[0], call[1], call[2], call[3]);
            answered += 1;
        } catch(ex) {
        }
    }

    // The frame a cross-frame caller looks for, which their cmpapi adds.
    try {
        if ( w.frames.__tcfapiLocator === undefined && doc.body !== null ) {
            const frame = doc.createElement('iframe');
            frame.style.cssText = 'display:none';
            frame.name = '__tcfapiLocator';
            doc.body.appendChild(frame);
        }
    } catch(ex) {
    }

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
        const call = payload.__tcfapiCall;
        if ( typeof call !== 'object' || call === null ) { return; }
        if ( call.callId === undefined ) { return; }
        if ( ev.source === null || ev.source === undefined ) { return; }
        api(call.command, call.version, (returnValue, success) => {
            let response = {
                __tcfapiReturn: { returnValue, success, callId: call.callId },
            };
            if ( wasString ) { response = JSON.stringify(response); }
            try {
                ev.source.postMessage(
                    response, ev.origin === 'null' ? '*' : ev.origin
                );
            } catch(ex) {
            }
        }, call.parameter);
    });

    // Their global, so a page calling it does not throw on a function that
    // went away with the bundle. The names are their manager's own, and the
    // ones that would render, record or re-ask resolve without doing any of
    // it: the answer is already in the keys above and does not change.
    const nothing = ( ) => Promise.resolve(undefined);
    try {
        w.appconsent = Object.assign({}, w.appconsent, {
            consentRR: VERSION,
            init: nothing,
            startCMP: nothing,
            initIAB: nothing,
            setConfiguration: nothing,
            update: nothing,
            updateExtraPurpose: nothing,
            show: nothing,
            noShow: nothing,
            presentNotice: nothing,
            retryShow: nothing,
            // Theirs record a decision. This one is already recorded.
            accept: nothing,
            deny: nothing,
            fakedeny: nothing,
            setExternalIds: nothing,
            getExternalIds: ( ) => Promise.resolve({}),
            getUuid: ( ) => Promise.resolve(''),
            isFloatingNeedUpdate: ( ) => Promise.resolve(false),
            extraFloatingAllowed: ( ) => Promise.resolve(false),
        });
    } catch(ex) {
    }

    try {
        w.console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' tcf=' + (tcf.granted ? 'granted' : 'refused') +
            (installed ? '' : '/noapi') +
            ' cmp=' + tcf.cmpId + '/' + tcf.cmpVersion +
            (tcf.reusedIdentity ? '' : '/default') +
            ' cc=' + tcf.publisherCC +
            ' keys=' + stored +
            ' state=' + restated +
            ' drained=' + answered
        );
    } catch(ex) {
    }
}
