/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The page-facing side of the Funding Choices resource: googlefc's own
    callback queue, the status getters a released callback calls, and the
    enums it compares them against.

    THIS IS THE GATE. Everything a publisher's wrapper reads, it reads inside
    a queue callback, so a wrapper that puts up a loader and waits never
    proceeds while the queue only collects. The earlier note in here - that
    their inactive path leaves the queue alone, so this did too - was measured
    off the small script their loader serves when there is nothing to show,
    and that path never releases a key because there is nothing to release. A
    site that gates its content is a site where Funding Choices is active, and
    there the callbacks do run.

    THEIR QUEUE, from the script fundingchoicesmessages.google.com serves:

        No = new Map([["adBlockData","AD_BLOCK_DATA_READY"], ...])

        Oo.prototype.push = function(a){
          if (typeof a === "object") { ...match a key of a against No's values,
            or k = "unrecognizedData" and console.error... }
          else k = "legacyNoData", l = a;
          if (k !== "unrecognizedData" && !this.Hc.get(k))
              return this.hb.get(k).push(l);
          if (typeof l === "function") {
              this.Pb.has(k) ? l(this.Pb.get(k)) : l(), this.Sc++ }
          return this.Sc }

    So a key that has not been released parks the callback and answers with
    the parked length; a released one calls it and answers with the number
    run. executeRemainingFunctions(name) releases a key and drains it, and
    executeRemainingFunctionsWithArgument(name, arg) releases it with an
    argument for the callbacks. A queue object already standing is left as it
    is and an array is drained into the new one, which is their _.Po.

    FOUR KEYS ARE RELEASED HERE, the ones whose getters this resource has.
    Theirs installs the getters and then releases the key - _.ep for
    consentData and legacyNoData with getConsentStatus and
    getConsentedProviderIds, _.fp for adBlockData with the three status
    getters, and lU for consentApi on the same boot path that makes the
    googlefcInactive and googlefcLoaded iframes, which is the path this
    resource reproduces. The other four stay parked, exactly as today:
    initialCcpaData, initialUsStatesData and initialUsStatesOptOutData come
    with US flow getters this resource does not have, consentModeData with
    getGoogleConsentModeValues, and releasing a callback into a getter that is
    not there trades a wait for a TypeError.

    CONSENT MODE v2 IS DENIED, over the four keys their own getter answers
    with, which a publisher reads in a CONSENT_MODE_DATA_READY callback and
    forwards to gtag:

        Yu.prototype.getGoogleConsentModeValues = function(){
          if (this.j !== 2 && this.j !== 3) return {
              adStoragePurposeConsentStatus: 4, ... }      // NOT_CONFIGURED
          return { adStoragePurposeConsentStatus: Xu(a.o()), ... } }
        Xu = a => a === 2 ? 1 : a === 3 ? 2 : throw        // granted, denied
        _.Zu = (a,b,c,d) => { _.go("getGoogleConsentModeValues", ..., !0);
                              _.Qo(a.G, "consentModeData") }

    So 2 is DENIED in their own mapping, and a refusal is four denials - a
    statement about what happened rather than a claim. Theirs computes the
    object once and hands the same one back on every call, so this does too,
    and consentModeData is released because its getter is now here.

    TWO DIVERGENCES THERE, BOTH TOWARDS REFUSAL AND NEITHER DETECTABLE once
    the response is blocked:

      the getter is installed unconditionally. Theirs reaches _.Zu only
      through a config this resource cannot see - "mU = function(a){ if
      (_.y(a.j,9)) { ... b = _.E(b,5); ... || _.Zu(a.C,b,c,e) } }", field 9
      being the publisher's Consent Mode configuration and field 5 the mode,
      of which 2 and 3 are the configured ones. On a publisher who never set
      it up, theirs installs no getter and leaves consentModeData parked for
      good. Here the config arrived in the response that was blocked, so
      there is nothing to condition on, and a page reading "typeof
      googlefc.getGoogleConsentModeValues === 'function'" as "Consent Mode is
      configured" is told yes where theirs would have said nothing. That is
      the same trade as showRevocationMessage: a callback that fires instead
      of hanging, at the cost of answering something theirs would not have
      offered on that page.

      analytics is denied rather than not configured. Theirs is
      "b = this.j === 3 ? Xu(a.j()) : 4", so under mode 2 it answers
      NOT_CONFIGURED for analyticsStoragePurposeConsentStatus while the three
      ad keys carry a real value. Which mode a publisher chose is in the same
      unreachable config, and denied is the safe direction of the two.

    THE STATUS GETTERS ANSWER UNKNOWN, which is their own value before
    detection. The gate a publisher writes is "if the status is
    EXTENSION_LEVEL_AD_BLOCKER, or NOT_WHITELISTED, or ADS_NOT_ALLOWED, put up
    the wall", and UNKNOWN passes it without claiming anything about the
    visitor. NO_AD_BLOCKER, WHITELISTED and ADS_ALLOWED are not on offer: that
    is not privacy, it is defeating ad-block detection, which is a different
    job and belongs in a list rather than in a consent resource.

    getConsentStatus IS NO_CONSENT, where theirs answers UNKNOWN always. It is
    the one divergence, and it goes the same way as the __uspapi version test:
    a refusal is what happened, and a page that polls until the status settles
    would spin on UNKNOWN.

    NOTHING IS STORED AND NOTHING IS ASKED. The queue runs on the wait the
    core hands in rather than at document_start, because a callback released
    before the body exists is a callback doing DOM work against nothing.

*/

function consentRRFundingChoicesPage(whenBody) {
    // Their map, internal name to the key a page writes, in their order.
    const KEYS = [
        [ 'adBlockData', 'AD_BLOCK_DATA_READY' ],
        [ 'consentData', 'CONSENT_DATA_READY' ],
        [ 'initialCcpaData', 'INITIAL_CCPA_DATA_READY' ],
        [ 'consentApi', 'CONSENT_API_READY' ],
        [ 'initialUsStatesData', 'INITIAL_US_STATES_DATA_READY' ],
        [ 'initialUsStatesOptOutData',
            'INITIAL_US_STATES_OPT_OUT_DATA_READY' ],
        [ 'consentModeData', 'CONSENT_MODE_DATA_READY' ],
        [ 'manualDeploymentApi', 'MANUAL_DEPLOYMENT_API_READY' ],
    ];

    const ENUMS = {
        ConsentStatusEnum: {
            UNKNOWN: 0,
            CONSENTED_TO_PERSONALIZED_ADS: 1,
            CONSENTED_TO_NON_PERSONALIZED_ADS: 2,
            CONTRIBUTOR: 3,
            NO_CONSENT: 4,
            CONSENT_NOT_REQUIRED: 5,
        },
        AdBlockerStatusEnum: {
            UNKNOWN: 0,
            EXTENSION_LEVEL_AD_BLOCKER: 1,
            NETWORK_LEVEL_AD_BLOCKER: 2,
            NO_AD_BLOCKER: 3,
        },
        WhitelistStatusEnum: {
            UNKNOWN: 0, NOT_WHITELISTED: 1, WHITELISTED: 2,
        },
        AllowAdsStatusEnum: { UNKNOWN: 0, ADS_NOT_ALLOWED: 1, ADS_ALLOWED: 2 },
        ConsentModePurposeStatusEnum: {
            CONSENT_MODE_PURPOSE_STATUS_UNKNOWN: 0,
            CONSENT_MODE_PURPOSE_STATUS_GRANTED: 1,
            CONSENT_MODE_PURPOSE_STATUS_DENIED: 2,
            CONSENT_MODE_PURPOSE_STATUS_NOT_APPLICABLE: 3,
            CONSENT_MODE_PURPOSE_STATUS_NOT_CONFIGURED: 4,
        },
    };

    const UNKNOWN = 0;
    const NO_CONSENT = ENUMS.ConsentStatusEnum.NO_CONSENT;
    // In their order: _.Qo(a.G, "consentData", "legacyNoData") from _.ep,
    // then adBlockData from _.fp, consentModeData from _.Zu, and consentApi
    // from lU.
    const RELEASED = [
        'consentData', 'legacyNoData', 'adBlockData', 'consentModeData',
        'consentApi',
    ];

    // Their four keys, each DENIED. One object, handed back on every call,
    // which is what their own getter does.
    const CONSENT_MODE = {
        adStoragePurposeConsentStatus: 2,
        adUserDataPurposeConsentStatus: 2,
        adPersonalizationPurposeConsentStatus: 2,
        analyticsStoragePurposeConsentStatus: 2,
    };

    const noopfn = function() {
    }.bind();

    const complain = (message, detail) => {
        try {
            if ( typeof console !== 'object' ) { return; }
            if ( typeof console.error !== 'function' ) { return; }
            console.error(message, detail);
        } catch ( ex ) {
        }
    };

    const install = googlefc => {
        // Their setter: a name the page already owns is left alone, except
        // the three they install with the overwrite flag set.
        const put = (name, value, overwrite) => {
            try {
                if ( overwrite !== true &&
                     Object.prototype.hasOwnProperty.call(googlefc, name) ) {
                    return;
                }
                googlefc[name] = value;
            } catch ( ex ) {
            }
        };

        for ( const name of Object.keys(ENUMS) ) { put(name, ENUMS[name]); }
        put('getConsentStatus', ( ) => NO_CONSENT);
        put('getConsentedProviderIds', ( ) => []);
        put('getAdBlockerStatus', ( ) => UNKNOWN, true);
        put('getWhitelistStatus', ( ) => UNKNOWN, true);
        put('getAllowAdsStatus', ( ) => UNKNOWN, true);
        put('showRevocationMessage', noopfn);
        // _.Zu installs this one with the overwrite flag set, as it does the
        // three status getters.
        put('getGoogleConsentModeValues', ( ) => CONSENT_MODE, true);

        // A queue object already standing is one of theirs or one of these,
        // and theirs leaves it alone; an array is what a publisher's snippet
        // parked before the script arrived, and is drained into this one. By
        // truthiness rather than by undefined, because that is their test -
        // "if (b && !Array.isArray(b)) return b" - so a callbackQueue set to
        // null is absent to them, and gets a queue rather than a shrug.
        const standing = googlefc.callbackQueue;
        if ( standing && Array.isArray(standing) === false ) {
            return 'theirs';
        }

        const parked = new Map();
        const released = new Map();
        const args = new Map();
        let ran = 0;

        const run = (fn, name) => {
            if ( typeof fn !== 'function' ) { return; }
            try {
                if ( args.has(name) ) { fn(args.get(name)); } else { fn(); }
                ran += 1;
            } catch ( ex ) {
                complain('Exception in queued FC callback', ex);
            }
        };

        const pick = entry => {
            if ( typeof entry === 'function' ) {
                return [ 'legacyNoData', entry ];
            }
            if ( typeof entry !== 'object' || entry === null ) { return null; }
            for ( const pair of KEYS ) {
                const fn = entry[pair[1]];
                if ( fn ) { return [ pair[0], fn ]; }
            }
            return null;
        };

        const push = entry => {
            const found = pick(entry);
            if ( found === null ) {
                let first;
                try {
                    first = Object.keys(entry)[0];
                } catch ( ex ) {
                }
                complain('Unrecognized data availability type in the' +
                    ' queued FC callback', first);
                return ran;
            }
            const name = found[0];
            const fn = found[1];
            if ( released.get(name) !== true ) {
                const list = parked.get(name) || [];
                list.push(fn);
                parked.set(name, list);
                return list.length;
            }
            run(fn, name);
            return ran;
        };

        const release = (name, argument) => {
            if ( argument !== undefined ) { args.set(name, argument); }
            released.set(name, true);
            const list = parked.get(name);
            parked.delete(name);
            if ( list === undefined ) { return; }
            for ( const fn of list ) { run(fn, name); }
        };

        const queue = {};
        queue.push = push;
        queue.executeRemainingFunctions = name => { release(name); };
        queue.executeRemainingFunctionsWithArgument = (name, argument) => {
            release(name, argument);
        };
        // Through the same guarded setter as the rest, with their own
        // overwrite flag: a page that made callbackQueue an accessor would
        // otherwise throw here and lose the queue along with it.
        put('callbackQueue', queue, true);
        if ( googlefc.callbackQueue !== queue ) { return 'theirs'; }

        let adopted = 0;
        if ( Array.isArray(standing) ) {
            for ( const entry of standing ) {
                adopted += 1;
                try {
                    push(entry);
                } catch ( ex ) {
                }
            }
        }

        const releaseAll = ( ) => {
            for ( const name of RELEASED ) { release(name); }
        };
        if ( typeof whenBody === 'function' ) { whenBody(releaseAll); }
        else { releaseAll(); }

        return adopted;
    };

    return { install };
}
