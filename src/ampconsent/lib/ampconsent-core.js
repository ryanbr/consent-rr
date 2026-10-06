/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    AMP's own consent extension, amp-consent, served from
    cdn.ampproject.org/v0/amp-consent-0.1.mjs (and -0.1.js, and -latest).

    This one is not a CMP that owns the page. It is an AMP extension: the AMP
    runtime loads it, and the runtime will not build ANY element that carries
    data-block-on-consent until this extension has registered a service and
    that service has answered. Measured in the runtime, v0.mjs:

        buildInternal() {
            const policy = this.consentPolicyId();
            const purposes = policy ? null : this.consentPurposes();
            if ( policy || purposes ) {
                return getServiceForDoc(this, 'consentPolicyManager', 'amp-consent')
                    .then(s => !s || (policy
                        ? s.whenPolicyUnblock(policy)
                        : s.whenPurposesUnblock(purposes)))
                    .then(ok => { if ( !ok ) throw new Error('BLOCK_BY_CONSENT'); });
            }
        }

    So blocking the file outright is not an option: with no extension, that
    service promise never resolves, and every gated element - an ad, an
    analytics tag, but also a video, an iframe or an image - stays unbuilt for
    the life of the page. The gate catches an element with
    data-block-on-consent, and any element whose tag is named in
    <meta name="amp-consent-blocking" content="AMP-AD,AMP-ANALYTICS">.

    What goes in instead is their refusal, in their own vocabulary:

      - consentState REJECTED (2), which is what their own reject button
        stores, written to their own store as well: AMP keeps it in
        localStorage under amp-store:<source origin>, base64 of
        {"vv":{"<key>":{"v":<value>,"t":<ms>}}}, and their key is
        amp-consent:<consentInstanceId> with {"s":0} for a refusal - 0, not 2,
        because their reader maps false|0 to REJECTED.
      - every consent policy resolved with THEIR arithmetic rather than a
        verdict invented here. A policy carries an unblockOn list, their
        predefined ones are

            default, _till_accepted      unblockOn [1,3]
            _till_responded, _auto_reject unblockOn [4,1,2,3]

        and a refusal is policy state 2, so an element waiting on the default
        policy stays blocked while one waiting on _till_responded goes ahead -
        a refusal is a response. A publisher's own unblockOn in the page's
        consent config is read and honoured, because it is theirs.
      - nothing requested: no checkConsentHref POST, no promptUISrc iframe, no
        onUpdateHref ping. The banner never exists, so there is nothing to
        dismiss.

    Use ampconsent-reject-unblock.js on a page that withholds content behind
    the default policy. It stores and reports the same refusal - what the ad
    request carries is still a refusal - and only lets the blocked elements
    build.

    WHAT THIS DOES NOT ANSWER: the TCF postMessage API. A tenant with
    "exposesTcfApi": true in its consent config gets an iframe named
    __tcfapiLocator and __tcfapiCall messages answered by their extension.
    Nothing here answers those, so an iframe asking gets no reply. See
    filters/ampconsent.txt.

*/

function consentRRAmpConsent(mode) {
    'use strict';

    const w = window;
    const doc = w.document;
    const NAME = 'ampconsent-' + mode;
    const VERSION = '@@VERSION@@';
    const unblockAll = mode === 'reject-unblock';

    /**************************************************************************/

    // Their CONSENT_ITEM_STATE, from the reader in their own bundle:
    // true|1 is accepted, false|0 is rejected, anything else unknown.
    const ACCEPTED = 1;
    const REJECTED = 2;
    const NOT_REQUIRED = 4;
    const ITEM_UNKNOWN = 5;

    // Their CONSENT_POLICY_STATE, from the mapping their policy instance does:
    // 1 from accepted, 2 from rejected, 3 from not-required, 4 otherwise.
    const SUFFICIENT = 1;
    const INSUFFICIENT = 2;
    const UNKNOWN_NOT_REQUIRED = 3;
    const POLICY_UNKNOWN = 4;

    // Their predefined policies, with the unblockOn lists their own element
    // builds: _till_accepted (and default, which is the same object) unblock
    // only on 1 or 3, the other two on anything.
    const UNBLOCK_ACCEPTED = [ SUFFICIENT, UNKNOWN_NOT_REQUIRED ];
    const UNBLOCK_ANY = [
        POLICY_UNKNOWN, SUFFICIENT, INSUFFICIENT, UNKNOWN_NOT_REQUIRED
    ];
    const PREDEFINED = {
        'default': UNBLOCK_ACCEPTED,
        '_till_accepted': UNBLOCK_ACCEPTED,
        '_till_responded': UNBLOCK_ANY,
        '_auto_reject': UNBLOCK_ANY,
    };

    // The refusal every answer below is made of.
    const consentState = REJECTED;
    const policyState = consentState === ACCEPTED
        ? SUFFICIENT
        : consentState === REJECTED
            ? INSUFFICIENT
            : consentState === NOT_REQUIRED
                ? UNKNOWN_NOT_REQUIRED
                : POLICY_UNKNOWN;

    // Their consent info record, field for field, and their metadata record.
    const consentInfo = ( ) => ({
        'consentState': consentState,
        'consentString': undefined,
        'consentMetadata': {
            'consentStringType': undefined,
            'additionalConsent': undefined,
            'gdprApplies': undefined,
            'purposeOne': undefined,
            'gppSectionId': undefined,
        },
        'purposeConsents': undefined,
        'isDirty': undefined,
        'tcfPolicyVersion': undefined,
    });

    let instanceId = '';
    let stored = false;
    let policyCount = 0;
    let built = 0;
    // The two services, held as they are constructed. Their element reaches
    // them through the doc service registry; this one does not have to, and a
    // registry walk is a shape of theirs that could change under it.
    let stateManager = null;
    let policyManager = null;
    // The page's own policy config, held here rather than pushed into the
    // policy manager when their element builds: which of the two exists first
    // is the runtime's business - it instantiates a doc service when the
    // extension registers, but a runtime that did it lazily would drop a
    // publisher's unblockOn on the floor. Read from here either way.
    let pagePolicy = null;

    /**************************************************************************/

    // Their source origin, which is what their storage is keyed by: on a cache
    // page the blob belongs to the publisher's origin, not the cache's. Their
    // own unwrap, measured: /c/s/<host>/... is https://<host> and /c/<host>/...
    // is http://<host>, on a cdn.ampproject.org proxy origin only.
    const reProxy = /^https:\/\/([a-zA-Z0-9_-]+\.)?cdn\.ampproject\.org$/;
    const sourceOrigin = ( ) => {
        try {
            const origin = w.location.origin;
            if ( reProxy.test(origin) === false ) { return origin; }
            const parts = String(w.location.pathname).split('/');
            if ( parts.length < 3 ) { return origin; }
            return parts[2] === 's'
                ? 'https://' + decodeURIComponent(parts[3])
                : 'http://' + decodeURIComponent(parts[2]);
        } catch ( ex ) {
        }
        return '';
    };

    // Their store: base64 of {"vv":{<key>:{"v":<value>,"t":<ms>}}} under
    // amp-store:<source origin>, capped at 8 entries, oldest evicted. The cap
    // is theirs too - writing without it would let this push a publisher's own
    // entry out of a store it does not own.
    const STORE_CAP = 8;
    const writeRefusal = id => {
        if ( id === '' ) { return false; }
        const origin = sourceOrigin();
        if ( origin === '' ) { return false; }
        const name = 'amp-store:' + origin;
        let blob = {};
        try {
            const raw = w.localStorage.getItem(name);
            if ( raw !== null && raw !== '' ) {
                blob = JSON.parse(w.atob(raw)) || {};
            }
        } catch ( ex ) {
            blob = {};
        }
        if ( typeof blob !== 'object' || blob === null ) { blob = {}; }
        let items = blob.vv;
        if ( typeof items !== 'object' || items === null ) {
            items = blob.vv = {};
        }
        items['amp-consent:' + id] = { 'v': { 's': 0 }, 't': Date.now() };
        const keys = Object.keys(items);
        while ( keys.length > STORE_CAP ) {
            let oldest = null;
            let when = Infinity;
            for ( const key of keys ) {
                const at = items[key] && items[key].t;
                if ( typeof at !== 'number' || at >= when ) { continue; }
                when = at;
                oldest = key;
            }
            if ( oldest === null ) { break; }
            delete items[oldest];
            keys.splice(keys.indexOf(oldest), 1);
        }
        try {
            w.localStorage.setItem(name, w.btoa(JSON.stringify(blob)));
            return true;
        } catch ( ex ) {
        }
        return false;
    };

    /**************************************************************************/

    // Their consentInstanceId, read from the page rather than assumed: the
    // inline config first, then their legacy single-entry "consents" map, then
    // the type attribute - every vendor in their own built-in table uses the
    // vendor name as the instance id.
    const readConfig = element => {
        let config = {};
        try {
            for ( const node of element.children ) {
                if ( node.tagName !== 'SCRIPT' ) { continue; }
                const type = String(node.getAttribute('type') || '')
                    .toLowerCase();
                if ( type !== 'application/json' ) { continue; }
                config = JSON.parse(node.textContent) || {};
                break;
            }
        } catch ( ex ) {
            config = {};
        }
        if ( typeof config !== 'object' || config === null ) { config = {}; }
        let id = typeof config.consentInstanceId === 'string'
            ? config.consentInstanceId
            : '';
        if ( id === '' && typeof config.consents === 'object' ) {
            const keys = Object.keys(config.consents || {});
            if ( keys.length === 1 ) { id = keys[0]; }
        }
        if ( id === '' ) {
            try {
                id = String(element.getAttribute('type') || '');
            } catch ( ex ) {
            }
        }
        return { id: id, policy: config.policy };
    };

    /**************************************************************************/

    // Their notificationUIManager, reimplemented rather than stubbed: a page
    // with amp-user-notification shares this service, and that extension
    // registers the same class, so a stub that never drains the queue would
    // leave a notification parked for ever. This is their own queue.
    const notificationUIManager = class {
        constructor() {
            this.count_ = 0;
            this.queue_ = Promise.resolve();
            this.onEmpty_ = ( ) => {};
            this.onNotEmpty_ = ( ) => {};
        }
        onQueueEmpty(handler) {
            this.onEmpty_ = handler;
            if ( this.count_ === 0 ) { handler(); }
        }
        onQueueNotEmpty(handler) {
            this.onNotEmpty_ = handler;
            if ( this.count_ > 0 ) { handler(); }
        }
        registerUI(show) {
            if ( this.count_ === 0 ) { this.onNotEmpty_(); }
            this.count_ += 1;
            const next = this.queue_.then(( ) => show().then(( ) => {
                this.count_ -= 1;
                if ( this.count_ === 0 ) { this.onEmpty_(); }
            }));
            this.queue_ = next;
            return next;
        }
    };

    // Their consentStateManager, answering the refusal. Their own callers are
    // the policy manager and their element; another extension asking gets the
    // same shapes, including the single-handler onConsentStateChange that
    // fires once with the current record.
    const consentStateManager = class {
        constructor(ampdoc) {
            this.ampdoc = ampdoc;
            this.handler_ = null;
            this.shared_ = null;
            this.ready_ = null;
            this.resolveReady_ = null;
            stateManager = this;
        }
        registerConsentInstance(id, config) {
            instanceId = String(id || '');
            stored = writeRefusal(instanceId);
            if ( this.resolveReady_ !== null ) {
                this.resolveReady_();
                this.resolveReady_ = null;
            }
            if ( this.handler_ !== null ) { this.handler_(consentInfo()); }
        }
        whenConsentReady() {
            if ( instanceId !== '' ) { return Promise.resolve(); }
            if ( this.ready_ === null ) {
                this.ready_ = new Promise(resolve => {
                    this.resolveReady_ = resolve;
                });
            }
            return this.ready_;
        }
        getConsentInstanceInfo() {
            return Promise.resolve(consentInfo());
        }
        getLastConsentInstanceInfo() {
            return Promise.resolve(consentInfo());
        }
        onConsentStateChange(handler) {
            this.handler_ = handler;
            this.getConsentInstanceInfo().then(info => { handler(info); });
        }
        getConsentInstanceSharedData() {
            return Promise.resolve(this.shared_);
        }
        setConsentInstanceSharedData(data) {
            this.shared_ = data;
        }
        // Nothing was asked of a CMP, so no purpose consent exists. Their own
        // reader treats that as not-consented rather than as an error.
        whenHasAllPurposeConsents() {
            return Promise.resolve();
        }
        hasAllPurposeConsents() {
        }
        // A page cannot argue the refusal up: their accept action is what a
        // banner's button calls, and there is no banner. The record stays.
        updateConsentInstanceState(state, consentString, metadata, purposes) {
        }
        setDirtyBit(dirty) {
            return Promise.resolve();
        }
        getSavedInstanceForTesting() {
            return consentInfo();
        }
        // Their anonymous per-page id, which goes to a CMP in their own
        // check-consent url. Nothing is sent, so nothing is minted.
        consentPageViewId64() {
            return Promise.resolve('');
        }
    };

    // Their consentPolicyManager. The policies are seeded here rather than
    // waited for: theirs waits for their element to parse the page's config
    // because that is when the consent decision can first exist, and here the
    // decision exists before the page does. An element that builds before the
    // amp-consent element does still gets an answer.
    const consentPolicyManager = class {
        constructor(ampdoc) {
            this.ampdoc = ampdoc;
            this.unblockOn_ = Object.create(null);
            for ( const id of Object.keys(PREDEFINED) ) {
                this.unblockOn_[id] = PREDEFINED[id];
            }
            this.onChange_ = null;
            policyManager = this;
            if ( pagePolicy !== null ) { this.adopt_(pagePolicy); }
        }
        adopt_(policies) {
            for ( const id of Object.keys(policies) ) {
                this.registerConsentPolicyInstance(id, policies[id]);
            }
        }
        setLegacyConsentInstanceId(id) {
            instanceId = String(id || instanceId || '');
        }
        // Their own config wins where the page set one: unblockOn is a
        // publisher's call, and a publisher who already unblocks on a refusal
        // does not need the unblock resource.
        registerConsentPolicyInstance(id, config) {
            policyCount += 1;
            const unblockOn = config && config.unblockOn;
            if ( Array.isArray(unblockOn) ) {
                this.unblockOn_[id] = unblockOn.slice();
            } else if ( this.unblockOn_[id] === undefined ) {
                this.unblockOn_[id] = UNBLOCK_ACCEPTED;
            }
        }
        enableTimeout() {
        }
        setOnPolicyChange(handler) {
            if ( this.onChange_ === null ) { this.onChange_ = handler; }
        }
        // Their answer for a policy they do not know is UNKNOWN, with an error
        // in the console - only their four predefined names exist, because
        // their own config parser drops every other key.
        whenPolicyResolved(policyId) {
            if ( PREDEFINED[policyId] === undefined ) {
                return Promise.resolve(POLICY_UNKNOWN);
            }
            return Promise.resolve(policyState);
        }
        whenPolicyUnblock(policyId) {
            if ( PREDEFINED[policyId] === undefined ) {
                return Promise.resolve(false);
            }
            built += 1;
            if ( unblockAll ) { return Promise.resolve(true); }
            const unblockOn = this.unblockOn_[policyId] || UNBLOCK_ACCEPTED;
            return Promise.resolve(unblockOn.indexOf(policyState) > -1);
        }
        // data-block-on-consent-purposes, which asks whether every named
        // purpose is consented. None is.
        whenPurposesUnblock(purposes) {
            built += 1;
            return Promise.resolve(unblockAll === true);
        }
        getMergedSharedData(policyId) {
            return this.whenPolicyResolved(policyId).then(( ) => null);
        }
        getConsentStringInfo(policyId) {
            return this.whenPolicyResolved(policyId).then(( ) => undefined);
        }
        getTcfPolicyVersion(policyId) {
            return this.whenPolicyResolved(policyId).then(( ) => undefined);
        }
        getConsentMetadataInfo(policyId) {
            return this.whenPolicyResolved(policyId)
                .then(( ) => consentInfo().consentMetadata);
        }
    };

    // The policy set their own element builds from the page's config: the
    // three predefined ones are added to whatever the page declared, default
    // falls back to the _till_accepted shape, and every key other than
    // default in a page's own policy map has already been dropped by their
    // config parser - so default is the only one a publisher can set.
    const pagePolicies = config => {
        const out = Object.create(null);
        const declared = config && typeof config === 'object' ? config : {};
        if ( declared['default'] !== undefined ) {
            out['default'] = declared['default'];
        }
        return out;
    };

    /**************************************************************************/

    // Their element, with their own getConsentPolicy - null, so the consent
    // element does not wait on consent itself - and none of the rest: no
    // prompt, no iframe, no request. Their CSS is replaced with the one rule
    // that matters, because the banner markup is the page's own child markup
    // and a page that put a notice inside amp-consent should not see it.
    const CSS = 'amp-consent{display:none!important}' +
        'amp-consent *{display:none!important}';

    const elementClass = AMP => class extends AMP.BaseElement {
        getConsentPolicy() {
            return null;
        }
        // Theirs takes nodisplay alone. Anything is taken here: a layout this
        // refuses is an element AMP never builds, and this one has work to do.
        isLayoutSupported(layout) {
            return true;
        }
        buildCallback() {
            this.install_(readConfig(this.element));
        }
        install_(read) {
            // Their order: the instance id first, so the record has a key,
            // then the policies.
            if ( stateManager !== null ) {
                stateManager.registerConsentInstance(read.id, {});
            } else if ( read.id !== '' ) {
                instanceId = read.id;
                stored = writeRefusal(instanceId);
            }
            pagePolicy = pagePolicies(read.policy);
            if ( policyManager !== null ) {
                policyManager.setLegacyConsentInstanceId(read.id);
                policyManager.adopt_(pagePolicy);
            }
            // Their own actions, registered so a page that wires a button to
            // one gets a no-op rather than an error. None of them moves the
            // record: the refusal is the answer.
            for ( const action of [
                'accept', 'reject', 'dismiss', 'setPurpose', 'prompt',
            ] ) {
                try {
                    this.registerAction(action, ( ) => {});
                } catch ( ex ) {
                }
            }
            try {
                this.element.setAttribute('aria-hidden', 'true');
                this.element.style.setProperty('display', 'none', 'important');
            } catch ( ex ) {
            }
        }
    };

    /**************************************************************************/

    // What the runtime reads off the entry below, and why none of it is
    // guessed:
    //
    //   m   1 for the module build, 0 for the classic one. Each runtime drops
    //       the entry that is not its own - module checks !m, classic checks m
    //       - so both are pushed and each runtime takes the one it wants. An
    //       entry with neither is dropped by both and nothing registers.
    //   v   the runtime's own version. On a mismatch the runtime calls
    //       reloadExtension, which fetches the real file from its /rtv/ url
    //       and this never runs. So it is read when the runtime reads it, off
    //       the attribute the runtime itself sets, with their AMP_CONFIG as
    //       the fallback - that is the same 13 digits with a 2 digit rtv
    //       prefix in front.
    //   n   the extension name the runtime waits on for the service.
    //   ev  the extension version, from the url this stands in for.
    //   l   whether this is the "latest" alias, which is what the real file
    //       says.
    //   f   the factory, called with the AMP namespace.
    const runtimeVersion = ( ) => {
        try {
            const pinned = doc.documentElement.getAttribute('amp-version');
            if ( typeof pinned === 'string' && pinned !== '' ) {
                return pinned;
            }
        } catch ( ex ) {
        }
        try {
            const config = w.AMP_CONFIG;
            const version = config && String(config.v || '');
            if ( /^[0-9]{15}$/.test(version) ) { return version.slice(2); }
            if ( /^[0-9]{13}$/.test(version) ) { return version; }
        } catch ( ex ) {
        }
        return '';
    };

    // Said once, from inside the registration, because that is the moment this
    // worked: the version it names is the runtime that took the entry. No line
    // at all means no registration - a version mismatch, or the real
    // extension having registered first.
    let said = false;
    const announce = ( ) => {
        if ( said ) { return; }
        said = true;
        if ( typeof console !== 'object' ) { return; }
        if ( typeof console.info !== 'function' ) { return; }
        console.info(
            '[consent-rr] ' + NAME + ' ' + VERSION +
            ' runtime=' + (runtimeVersion() || 'unknown') +
            ' state=rejected policy=' + policyState +
            ' unblock=' + (unblockAll ? 'all' : 'theirs') +
            ' banner=none sent=none'
        );
    };

    const factory = AMP => {
        try {
            AMP.registerServiceForDoc(
                'notificationUIManager', notificationUIManager
            );
        } catch ( ex ) {
        }
        AMP.registerServiceForDoc('consentStateManager', consentStateManager);
        AMP.registerServiceForDoc('consentPolicyManager', consentPolicyManager);
        AMP.registerElement('amp-consent', elementClass(AMP), CSS);
        announce();
    };

    const entry = module => {
        const out = {
            'm': module,
            'n': 'amp-consent',
            'ev': '0.1',
            'l': true,
            'f': factory,
        };
        // A getter, because the runtime reads this during its own startup and
        // the version is not on the page until the runtime puts it there.
        try {
            Object.defineProperty(out, 'v', {
                get: runtimeVersion,
                enumerable: true,
                configurable: true,
            });
        } catch ( ex ) {
            out.v = runtimeVersion();
        }
        return out;
    };

    const queue = w.AMP = w.AMP || [];
    try {
        queue.push(entry(1));
        queue.push(entry(0));
    } catch ( ex ) {
    }

    // A marker rather than an API: nothing of theirs is a page-facing global,
    // so neither is this, and it is not enumerable for the same reason.
    try {
        Object.defineProperty(w, 'ampConsentRR', {
            value: {
                name: NAME,
                version: VERSION,
                mode: mode,
                state: function() {
                    return {
                        instanceId: instanceId,
                        stored: stored,
                        policies: policyCount,
                        asked: built,
                    };
                },
            },
            configurable: true,
            enumerable: false,
            writable: true,
        });
    } catch ( ex ) {
    }
}
