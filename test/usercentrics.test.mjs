/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { GppModel } from '@iabgpp/cmpapi';
import { TCString } from '@iabtcf/core';
import { filtersText, loadResources, runDom, versions } from './helpers.mjs';

const URL = 'https://example.de/';

// Their own script tag, which is also where the configuration lives.
const TAG = '<script id="usercentrics-cmp" data-settings-id="sROYKApBP"' +
    ' data-language="de"' +
    ' src="https://web.eu1.cmp.usercentrics.eu/ui/loader.js"></script>';

// Their v2 entry: another host, another record, and UC_UI as the whole API.
const TAG_V2 = '<script id="usercentrics-cmp" data-settings-id="sROYKApBP"' +
    ' data-language="de"' +
    ' src="https://app.usercentrics.eu/browser-ui/latest/loader.js"></script>';

const page = (head = TAG) => '<!doctype html><html lang="en"><head>' + head +
    '</head><body><p id="content">x</p></body></html>';

// uc-block.bundle.js, reduced to the parts a refusal has to satisfy, each one
// read off the bundle:
//   disabledProviders is every provider NOT in whitelisted
//   whitelisted is built at construction from the record already in storage -
//     ucData.consent.services for a v3 page, uc_settings for a v2 one
//   Storage.prototype.setItem is patched, and a write of ucData or uc_settings
//     marks the CMP loaded and calls setStatus for each id IN THAT VALUE
//   setStatus returns early when the id is already in that state, which is
//     what makes their own re-read on UC_UI_INITIALIZED a no-op
//   UC_UI_INITIALIZED marks the CMP loaded too, and re-reads for v3
const BLOCKER = `(function() {
    var w = window;
    var providers = [ 'HkocEodjb7', 'XYQZBUojc', 'SkPc5EjOsWm', 'BJz7qNsdj-7' ];
    var uc = {
        isCMPLoaded: false,
        whitelisted: new Set(),
        statusCalls: [],
        isCMPv3: function() {
            return w.document.querySelectorAll(
                'script[src$=".cmp.usercentrics.eu/ui/loader.js"]').length > 0;
        },
        v3Services: function() {
            try {
                var data = JSON.parse(w.localStorage.getItem('ucData'));
                return (data && data.consent && data.consent.services) || {};
            } catch (ex) { return {}; }
        },
        v2Services: function() {
            try {
                var data = JSON.parse(w.localStorage.getItem('uc_settings'));
                return (data && data.services) || [];
            } catch (ex) { return []; }
        },
        setStatus: function(id, status) {
            if ( uc.whitelisted.has(id) === Boolean(status) ) { return; }
            uc.statusCalls.push([ id, status ]);
            if ( providers.indexOf(id) === -1 ) { return; }
            if ( status ) { uc.whitelisted.add(id); }
            else { uc.whitelisted.delete(id); }
        },
        disabled: function() {
            return providers.filter(function(id) {
                return uc.whitelisted.has(id) === false;
            });
        }
    };
    if ( uc.isCMPv3() ) {
        var services = uc.v3Services();
        Object.keys(services).forEach(function(id) {
            if ( services[id] && services[id].consent ) { uc.whitelisted.add(id); }
        });
    } else {
        uc.v2Services().forEach(function(service) {
            if ( service && service.status ) { uc.whitelisted.add(service.id); }
        });
    }
    var setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        if ( key === 'ucData' || key === 'uc_settings' ) {
            if ( w.localStorage.getItem(key) === value ) {
                return setItem.call(this, key, value);
            }
            uc.isCMPLoaded = true;
            try {
                var parsed = JSON.parse(value);
                if ( key === 'ucData' ) {
                    var map = (parsed.consent && parsed.consent.services) || {};
                    Object.keys(map).forEach(function(id) {
                        uc.setStatus(id, map[id] && map[id].consent);
                    });
                } else {
                    (parsed.services || []).forEach(function(service) {
                        uc.setStatus(service.id, service.status);
                    });
                }
            } catch (ex) {}
        }
        return setItem.call(this, key, value);
    };
    w.addEventListener('UC_UI_INITIALIZED', function() {
        uc.isCMPLoaded = true;
        if ( uc.isCMPv3() === false ) { return; }
        var services = uc.v3Services();
        Object.keys(services).forEach(function(id) {
            uc.setStatus(id, services[id] && services[id].consent);
        });
    });
    w.uc = uc;
})();`;

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('usercentrics-reject.js');
});

// As the loader.js replacement: their blocker is already there, because the
// page loads it first.
const asLoader = (options = {}) => runDom(
    reject, options.url || URL, page(options.head),
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
        w.eval(BLOCKER);
    }
);

// As a scriptlet at document_start: this runs first, the blocker after.
const asScriptlet = (options = {}) => {
    const dom = runDom(reject, options.url || URL, page(options.head),
        w => {
            if ( typeof options.before === 'function' ) { options.before(w); }
        }
    );
    dom.window.eval(BLOCKER);
    return dom;
};

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const data = w => JSON.parse(w.localStorage.getItem('ucData'));

// jsdom objects come from the page's realm, so deepEqual on them compares
// prototypes too.
const plain = value => JSON.parse(JSON.stringify(value));

const accepted = (services) => w => {
    w.localStorage.setItem('ucData', JSON.stringify({
        gcm: {
            adsDataRedaction: false,
            adStorage: 'granted',
            adPersonalization: 'granted',
            adUserData: 'granted',
            analyticsStorage: 'granted',
        },
        consent: { services },
        ui: { language: 'de' },
    }));
};

/******************************************************************************/

describe('usercentrics-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('usercentrics-'));
        assert.deepEqual(names, [ 'usercentrics-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(
            reject.includes("const VERSION = '" + versions.usercentrics + "'")
        );
    });

    it('records a refusal the blocker reads, without naming a service', ( ) => {
        const w = asLoader().window;
        const record = data(w);
        // Their own full refusal: no service consented. A first visit cannot
        // name the tenant's ids, and does not have to - the blocker blocks
        // every provider it was not told to whitelist.
        assert.deepEqual(plain(record.consent.services), {});
        assert.equal(w.uc.whitelisted.size, 0);
        assert.deepEqual(plain(w.uc.disabled()),
            [ 'HkocEodjb7', 'XYQZBUojc', 'SkPc5EjOsWm', 'BJz7qNsdj-7' ]);
    });

    it('revokes what a returning visitor had accepted', ( ) => {
        // The case an empty map cannot carry: the blocker has already read the
        // old record and whitelisted those two, and its setItem hook only
        // visits the ids in the value written over it.
        const w = asLoader({
            before: accepted({
                HkocEodjb7: { name: 'Google Analytics', consent: true },
                XYQZBUojc: { name: 'Facebook Social Plugins', consent: true },
            }),
        }).window;
        assert.deepEqual(plain(data(w).consent.services), {
            HkocEodjb7: { name: 'Google Analytics', consent: false },
            XYQZBUojc: { name: 'Facebook Social Plugins', consent: false },
        });
        // Named, so their hook turned each one off.
        assert.deepEqual(plain(w.uc.statusCalls),
            [ [ 'HkocEodjb7', false ], [ 'XYQZBUojc', false ] ]);
        assert.equal(w.uc.whitelisted.size, 0);
        assert.equal(w.uc.disabled().length, 4);
    });

    it('revokes through their v2 record as well', ( ) => {
        // No loader tag, so the blocker takes its v2 branch and builds the
        // whitelist out of uc_settings instead.
        const w = asScriptlet({
            head: '',
            before: w_ => {
                w_.localStorage.setItem('uc_settings', JSON.stringify({
                    controllerId: 'abc',
                    services: [
                        { id: 'HkocEodjb7', name: 'Google Analytics', status: true },
                        { id: 'XYQZBUojc', name: 'Facebook', status: true },
                    ],
                }));
            },
        }).window;
        const legacy = JSON.parse(w.localStorage.getItem('uc_settings'));
        assert.deepEqual(plain(legacy.services.map(s => [ s.id, s.status ])), [
            [ 'HkocEodjb7', false ],
            [ 'XYQZBUojc', false ],
        ]);
        // Their other fields are kept, not rewritten.
        assert.equal(legacy.controllerId, 'abc');
        assert.equal(w.uc.whitelisted.size, 0);
        // And the ids reached the v3 record too, which is what a v3 page reads.
        assert.deepEqual(plain(Object.keys(data(w).consent.services)),
            [ 'HkocEodjb7', 'XYQZBUojc' ]);
    });

    it('invents no v2 record on a page that is plainly v3', ( ) => {
        // There the blocker reads ucData, so a v2 record would be noise.
        const w = asLoader().window;
        assert.equal(w.localStorage.getItem('uc_settings'), null);
    });

    it('writes their v2 record where that is the one being read', ( ) => {
        let out;
        const w = asLoader({
            head: TAG_V2,
            before: w_ => { out = lines(w_); },
        }).window;
        // Their own mapSettings shape, with nothing consented.
        assert.deepEqual(
            plain(JSON.parse(w.localStorage.getItem('uc_settings'))),
            {
                controllerId: '',
                id: 'sROYKApBP',
                language: 'de',
                services: [],
            }
        );
        assert.ok(out[0].includes(' cmp=v2 '), out[0]);
        assert.ok(out[0].includes(' v2=written'), out[0]);
        // v2 has no __ucCmp: UC_UI is the whole API there, so a page feature
        // detecting one is not told it has the other.
        assert.equal(w.__ucCmp, undefined);
        assert.equal(typeof w.UC_UI, 'object');
        // And the blocker, which cannot see a v3 tag, reads the v2 record.
        assert.equal(w.uc.whitelisted.size, 0);
        assert.equal(w.uc.disabled().length, 4);
    });

    it('announces no v3 API on a v2 page', ( ) => {
        const seen = [];
        asLoader({
            head: TAG_V2,
            before: w_ => {
                for ( const name of [ 'UC_CMP_API_READY', 'UC_UI_INITIALIZED' ] ) {
                    w_.addEventListener(name, ( ) => { seen.push(name); });
                }
            },
        });
        // Their v2 fires UC_UI_INITIALIZED and has no UC_CMP_API_READY at all.
        assert.deepEqual(plain(seen), [ 'UC_UI_INITIALIZED' ]);
    });

    it('writes both records where the generation cannot be told', ( ) => {
        let out;
        const w = asScriptlet({
            head: '',
            before: w_ => { out = lines(w_); },
        }).window;
        // Injected, so there is no tag of either kind to read - and the
        // blocker takes its v2 branch precisely then.
        assert.ok(out[0].includes(' cmp=unknown '), out[0]);
        assert.deepEqual(plain(data(w).consent.services), {});
        assert.deepEqual(
            plain(JSON.parse(w.localStorage.getItem('uc_settings')).services), []
        );
        assert.equal(w.uc.whitelisted.size, 0);
    });

    it('records that the question was answered, their way', ( ) => {
        // Their setUserActionPerformed(true). An SDK this did not replace -
        // their browser-sdk is a library a site calls, not a loader - reads
        // this and leaves the visitor alone instead of prompting again.
        const w = asLoader().window;
        assert.equal(w.localStorage.getItem('uc_user_interaction'), 'true');
        assert.equal(w.localStorage.getItem('uc_interaction_type'), 'user');
        // Answered, not accepted: the record beside it consents to nothing.
        assert.deepEqual(plain(data(w).consent.services), {});
    });

    it('marks the CMP loaded by writing, as their own CMP does', ( ) => {
        const w = asLoader().window;
        // Their setItem hook, which is how the blocker learns a CMP is there.
        assert.equal(w.uc.isCMPLoaded, true);
    });

    it('denies every Google consent-mode key', ( ) => {
        const w = asLoader().window;
        assert.deepEqual(plain(data(w).gcm), {
            adsDataRedaction: true,
            adStorage: 'denied',
            adPersonalization: 'denied',
            adUserData: 'denied',
            analyticsStorage: 'denied',
        });
    });

    it('pushes their consent mode the way gtag pushes', ( ) => {
        const w = asLoader().window;
        assert.equal(w.dataLayer.length, 2);
        // The arguments object, not an array of it: consent mode reads the
        // first kind. Their GcmModel.push does this.
        assert.equal(Array.isArray(w.dataLayer[0]), false);
        assert.equal(typeof w.dataLayer[0].length, 'number');
        assert.deepEqual(
            plain(Array.from(w.dataLayer).map(entry => Array.from(entry))),
            [
                [ 'consent', 'update', {
                    ad_storage: 'denied',
                    ad_personalization: 'denied',
                    ad_user_data: 'denied',
                    analytics_storage: 'denied',
                } ],
                [ 'set', 'ads_data_redaction', true ],
            ]
        );
    });

    it('keeps a data layer the page already has', ( ) => {
        const w = asLoader({
            before: w_ => { w_.eval('window.dataLayer = [ "theirs" ];'); },
        }).window;
        assert.equal(w.dataLayer[0], 'theirs');
        assert.equal(w.dataLayer.length, 3);
    });

    it('answers the API their loader defines, with promises as theirs are',
        async ( ) => {
            const w = asLoader().window;
            assert.equal(typeof w.__ucCmp, 'object');
            // Their own facade resolves rather than returning: a page that
            // awaits it is not left hanging.
            assert.equal(await w.__ucCmp.isInitialized(), true);
            assert.deepEqual(plain(await w.__ucCmp.getServicesBaseInfo()), []);
            assert.equal(await w.__ucCmp.isConsentRequired(), false);
            assert.equal(await w.__ucCmp.areAllConsentsAccepted(), false);
            assert.deepEqual(plain(await w.__ucCmp.getSettingsCore()),
                { id: 'sROYKApBP' });
            // The ones that would show a layer or save a decision do neither.
            assert.equal(await w.__ucCmp.showSecondLayer(), undefined);
            assert.equal(await w.__ucCmp.acceptAllConsents(), undefined);
            assert.deepEqual(plain(data(w).consent.services), {});
        }
    );

    it('answers UC_UI, which is what a site and their blocker call', ( ) => {
        const w = asLoader().window;
        assert.equal(typeof w.UC_UI, 'object');
        // Synchronous there, because the blocker checks Array.isArray on it.
        assert.equal(w.UC_UI.isInitialized(), true);
        assert.deepEqual(plain(w.UC_UI.getServicesBaseInfo()), []);
        assert.equal(w.UC_UI.areAllConsentsAccepted(), false);
        // Theirs answer undefined on a v3 page, so these do too.
        assert.equal(w.UC_UI.getSettingsCore(), undefined);
        assert.deepEqual(plain(w.UC_UI.getSettingsLabels()), {});
        // Synchronous, as v2's are: a page calling .toUpperCase() on the
        // answer would break on a promise.
        assert.equal(w.UC_UI.getActiveLanguage(), 'de');
        assert.equal(w.UC_UI.getControllerId(), '');
        assert.equal(w.UC_UI.isConsentRequired(), false);
        assert.equal(w.UC_UI.getThirdPartyCount(), 0);
    });

    it('fires their events, in their order', ( ) => {
        const seen = [];
        const w = asLoader({
            before: w_ => {
                for ( const name of [
                    'UC_CMP_API_READY', 'UC_SETTINGS_ID_RESOLVED',
                    'UC_GCM_UPDATE', 'UC_UI_INITIALIZED',
                ] ) {
                    w_.addEventListener(name, ev => {
                        seen.push([ name, ev.detail ]);
                    });
                }
            },
        }).window;
        assert.deepEqual(seen.map(entry => entry[0]), [
            // Their loader defines __ucCmp and announces it first, and the UI
            // event comes last - the blocker takes that one as "CMP is up".
            'UC_CMP_API_READY',
            'UC_SETTINGS_ID_RESOLVED',
            'UC_GCM_UPDATE',
            'UC_UI_INITIALIZED',
        ]);
        assert.deepEqual(plain(seen[1][1]),
            { settingsId: 'sROYKApBP', sandbox: false });
        assert.equal(seen[2][1].adStorage, 'denied');
        assert.equal(w.uc.isCMPLoaded, true);
    });

    it('writes the record before announcing the CMP is up', ( ) => {
        // Their blocker takes UC_UI_INITIALIZED as "a CMP is here" and, on a
        // v3 page, re-reads the record right then. Announcing first would have
        // it read whatever the old one was.
        let atAnnounce;
        asLoader({
            before: w_ => {
                w_.addEventListener('UC_UI_INITIALIZED', ( ) => {
                    atAnnounce = w_.localStorage.getItem('ucData');
                });
            },
        });
        assert.ok(atAnnounce !== null && atAnnounce !== undefined);
        assert.deepEqual(
            plain(JSON.parse(atAnnounce).consent.services), {}
        );
    });

    it('says nothing about a settings id it cannot read', ( ) => {
        const seen = [];
        let out;
        const w = asLoader({
            head: '',
            before: w_ => {
                out = lines(w_);
                w_.addEventListener('UC_SETTINGS_ID_RESOLVED',
                    ev => { seen.push(ev.detail); });
            },
        }).window;
        // No tag, so no id, and the event that carries one is not invented.
        assert.deepEqual(plain(seen), []);
        assert.ok(out[0].includes(' settings=unknown'), out[0]);
        // The refusal still goes in.
        assert.deepEqual(plain(data(w).consent.services), {});
    });

    it('takes the language from their tag, then the document', ( ) => {
        assert.equal(data(asLoader().window).ui.language, 'de');
        // Only the blocker reads this, to pick the translation for a
        // placeholder it leaves in place.
        const w = asLoader({
            head: '<script id="usercentrics-cmp"></script>',
        }).window;
        assert.equal(data(w).ui.language, 'en');
        const regional = asLoader({
            head: '<script id="usercentrics-cmp" data-language="pt-BR"></script>',
        }).window;
        assert.equal(data(regional).ui.language, 'pt');
    });

    it('works injected before their blocker, which is the scriptlet order',
        ( ) => {
            const w = asScriptlet().window;
            assert.deepEqual(plain(data(w).consent.services), {});
            // It read the refusal out of storage at construction rather than
            // being told about it, so nothing is whitelisted.
            assert.equal(w.uc.whitelisted.size, 0);
            assert.equal(w.uc.disabled().length, 4);
        }
    );

    it('leaves a tag the site parked for a service', ( ) => {
        // Their SDK's own parking, which only it unblocks:
        // script[data-usercentrics][type="text/plain"].
        const w = asLoader({
            before: w_ => {
                const parked = w_.document.createElement('script');
                parked.type = 'text/plain';
                parked.setAttribute('data-usercentrics', 'Google Analytics');
                parked.setAttribute('src', 'https://x.test/a.js');
                w_.document.body.appendChild(parked);
            },
        }).window;
        const parked = w.document.querySelector('script[data-usercentrics]');
        assert.equal(parked.type, 'text/plain');
    });

    it('writes through a storage hook that throws the first time', ( ) => {
        // Their blocker patches Storage.prototype.setItem and its hook runs
        // before the real write. On a page still carrying the legacy script
        // tag it throws every time: that script is gone from their CDN, so
        // window.usercentrics never exists and the hook's first act is to ask
        // it for the service list. It sets its own loaded flag before that, so
        // a second attempt gets through - and the record would otherwise be
        // silently missing.
        let thrown = 0;
        const w = asLoader({
            before: w_ => {
                w_.eval('(function() {' +
                    'var real = Storage.prototype.setItem;' +
                    'var tripped = false;' +
                    'window.__thrown = 0;' +
                    'Storage.prototype.setItem = function(key, value) {' +
                    ' if ( tripped === false && key.indexOf("uc") === 0 ) {' +
                    '  tripped = true; window.__thrown += 1;' +
                    '  throw new TypeError("t.includes is not a function");' +
                    ' }' +
                    ' return real.call(this, key, value);' +
                    '};' +
                    '})();');
            },
        }).window;
        thrown = w.__thrown;
        assert.equal(thrown, 1);
        // The record landed anyway.
        assert.deepEqual(plain(data(w).consent.services), {});
        assert.equal(w.localStorage.getItem('uc_user_interaction'), 'true');
    });

    it('does nothing the second time it is injected', ( ) => {
        const dom = asLoader();
        const w = dom.window;
        const before = w.localStorage.getItem('ucData');
        const pushes = w.dataLayer.length;
        w.eval(reject);
        assert.equal(w.localStorage.getItem('ucData'), before);
        assert.equal(w.dataLayer.length, pushes);
    });

    it('says on the console what it did', ( ) => {
        let out;
        asLoader({ before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] usercentrics-reject ' + versions.usercentrics +
            ' settings=sROYKApBP lang=de revoked=none gcm=denied gpc=off' +
            ' cmp=v3 answered=true iab=off gpp=off data=written'
        );
    });

    it('leaves the GPC signal to them, and refuses either way', ( ) => {
        let out;
        const w = asLoader({
            before: w_ => {
                out = lines(w_);
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true,
                    configurable: true,
                });
            },
        }).window;
        // Their own record carries a gpcSignal field and their SDK reads the
        // signal; there is nothing here for it to change, because everything
        // is refused without it. The console says whether it was sent.
        assert.ok(out[0].includes(' gpc=on'), out[0]);
        assert.deepEqual(plain(data(w).consent.services), {});
        assert.equal(data(w).gcm.adStorage, 'denied');
    });
});

/******************************************************************************/

// Their core segment's first fields are fixed width, so a string can be
// rewritten to carry another tenant's identity without an encoder - which is
// what a returning visitor's record holds, and what this has to read back.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const bitsOf = core => {
    let bits = '';
    for ( const character of core ) {
        bits += B64.indexOf(character).toString(2).padStart(6, '0');
    }
    return bits;
};

const fromBits = bits => {
    let padded = bits;
    while ( padded.length % 6 !== 0 ) { padded += '0'; }
    let out = '';
    for ( let i = 0; i < padded.length; i += 6 ) {
        out += B64.charAt(parseInt(padded.slice(i, i + 6), 2));
    }
    return out;
};

const patch = (tcString, fields) => {
    const parts = tcString.split('.');
    let bits = bitsOf(parts[0]);
    const put = (offset, width, value) => {
        bits = bits.slice(0, offset) +
            value.toString(2).padStart(width, '0').slice(-width) +
            bits.slice(offset + width);
    };
    const putLetters = (offset, letters) => {
        for ( let i = 0; i < 2; i += 1 ) {
            put(offset + i * 6, 6, letters.charCodeAt(i) - 65);
        }
    };
    if ( fields.cmpId !== undefined ) { put(78, 12, fields.cmpId); }
    if ( fields.cmpVersion !== undefined ) { put(90, 12, fields.cmpVersion); }
    if ( fields.vendorListVersion !== undefined ) {
        put(120, 12, fields.vendorListVersion);
    }
    if ( fields.publisherCC !== undefined ) {
        putLetters(201, fields.publisherCC);
    }
    parts[0] = fromBits(bits);
    return parts.join('.');
};

describe('usercentrics-reject, the IAB layer', ( ) => {
    const withStub = (options = {}) => asLoader(Object.assign({}, options, {
        before: w_ => {
            if ( typeof options.before === 'function' ) { options.before(w_); }
            // The stub a TCF publisher puts on the page before its CMP loads.
            w_.eval('window.__tcfapiStubCalls = [];' +
                'window.__tcfapi = function() {' +
                ' var a = arguments;' +
                ' if ( a.length === 0 ) { return window.__tcfapiStubCalls; }' +
                ' window.__tcfapiStubCalls.push(a);' +
                '};');
        },
    }));

    const tcData = w => {
        let data;
        w.__tcfapi('getTCData', 2, d => { data = d; });
        return data;
    };

    it('adds nothing where the page shows no sign of TCF', ( ) => {
        // Whether a tenant is TCF comes back from their settings API, which a
        // replaced CMP never fetches - so a page with no stub, no locator and
        // no record gets no layer it would not otherwise have had.
        let out;
        const w = asLoader({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(w.__tcfapi, undefined);
        assert.equal(w.localStorage.getItem('uc_tcf'), null);
        assert.ok(out[0].includes(' iab=off'), out[0]);
        assert.equal(out[0].includes(' tcf='), false, out[0]);
    });

    it('answers a page carrying their stub, refusing everything', ( ) => {
        let out;
        const w = withStub({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(typeof w.__tcfapi, 'function');
        assert.ok(out[0].includes(' iab=refused/default tcf=stub'), out[0]);
        // The one field that is not a refusal but a claim about the law: a
        // vendor told GDPR does not apply may process without consent at all,
        // so this says it does.
        const data = tcData(w);
        assert.equal(data.gdprApplies, true);
        assert.equal(data.eventStatus, 'tcloaded');
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.purpose.consents[1], false);
        assert.equal(data.purpose.legitimateInterests[2], false);
        assert.deepEqual(plain(data.vendor.consents), {});
        // Decoded by the IAB's own library, not by this test's reading of it.
        const decoded = TCString.decode(data.tcString);
        assert.equal(decoded.cmpId, 5);          // their own fallback
        assert.equal(decoded.cmpVersion, 3);
        assert.equal(decoded.policyVersion, 5);  // hard-coded in their model
        assert.equal(decoded.isServiceSpecific, true);
        assert.equal(decoded.consentLanguage, 'DE');
        // Their deny-all unsets all four of these, so all four are empty.
        assert.equal(decoded.purposeConsents.size, 0);
        assert.equal(decoded.purposeLegitimateInterests.size, 0);
        assert.equal(decoded.vendorConsents.size, 0);
        assert.equal(decoded.vendorLegitimateInterests.size, 0);
        assert.equal(decoded.specialFeatureOptins.size, 0);
        assert.equal(decoded.publisherConsents.size, 0);
        assert.equal(decoded.publisherLegitimateInterests.size, 0);
    });

    it('keeps their record, with no additional-consent string invented', ( ) => {
        const w = withStub().window;
        const record = JSON.parse(w.localStorage.getItem('uc_tcf'));
        assert.deepEqual(Object.keys(record).sort(),
            [ 'acString', 'tcString', 'timestamp', 'vendors' ]);
        // Their shape. The AC string lists Google's additional-consent
        // vendors, and a refusal consents to none - theirs reads an empty one
        // as nothing to compare, which is what stops it resurfacing the UI.
        assert.equal(record.acString, '');
        assert.deepEqual(plain(record.vendors), []);
        assert.equal(record.tcString, tcData(w).tcString);
        assert.equal(typeof record.timestamp, 'number');
    });

    it('reuses the identity a returning visitor already carries', ( ) => {
        // A tenant's own cmpId is in their settings - 318 with cmpVersion 1 on
        // the TCF tenant sampled - so it cannot be known here. Where the
        // visitor has a string already, it is read back out of that.
        const first = withStub().window;
        const prior = patch(tcData(first).tcString, {
            cmpId: 318,
            cmpVersion: 1,
            vendorListVersion: 42,
            publisherCC: 'DE',
        });
        let out;
        const w = asLoader({
            before: w_ => {
                out = lines(w_);
                w_.localStorage.setItem('uc_tcf', JSON.stringify({
                    acString: '', tcString: prior, timestamp: 1, vendors: [],
                }));
            },
        }).window;
        // The record alone is evidence enough; no stub needed.
        assert.ok(out[0].includes(' iab=refused tcf=record'), out[0]);
        const decoded = TCString.decode(tcData(w).tcString);
        assert.equal(decoded.cmpId, 318);
        assert.equal(decoded.cmpVersion, 1);
        assert.equal(decoded.vendorListVersion, 42);
        assert.equal(decoded.publisherCountryCode, 'DE');
        // And it is still a refusal, whoever it is attributed to.
        assert.equal(decoded.purposeConsents.size, 0);
        assert.equal(decoded.vendorConsents.size, 0);
    });

    it('installs on a locator frame as well', ( ) => {
        let out;
        const w = asLoader({
            before: w_ => {
                out = lines(w_);
                const frame = w_.document.createElement('iframe');
                frame.name = '__tcfapiLocator';
                w_.document.body.appendChild(frame);
            },
        }).window;
        assert.ok(out[0].includes(' tcf=locator'), out[0]);
        assert.equal(typeof w.__tcfapi, 'function');
    });

    it('answers what the page asked before it arrived', ( ) => {
        const seen = [];
        const w = withStub({
            before: w_ => {
                w_.__consentRRSeen = seen;
            },
        }).window;
        // Queue a call the way a publisher's stub does, then re-run: the
        // resource drains it rather than leaving it unanswered.
        w.eval('window.__tcfapiStubCalls = [];' +
            'window.__tcfapi = function() {' +
            ' var a = arguments;' +
            ' if ( a.length === 0 ) { return window.__tcfapiStubCalls; }' +
            ' window.__tcfapiStubCalls.push(a);' +
            '};');
        w.eval('window.__answers = [];' +
            'window.__tcfapi("getTCData", 2, function(d, ok) {' +
            ' window.__answers.push([ d && d.tcString !== "", ok ]); });');
        assert.equal(w.__answers.length, 0);
        w.eval('window.__ucCmp = undefined;');
        w.eval(reject);
        assert.deepEqual(plain(w.__answers), [ [ true, true ] ]);
    });

    it('answers ping, and takes a listener off again', ( ) => {
        const w = withStub().window;
        let ping;
        w.__tcfapi('ping', 2, data => { ping = data; });
        assert.equal(ping.cmpLoaded, true);
        assert.equal(ping.cmpStatus, 'loaded');
        assert.equal(ping.gdprApplies, true);
        assert.equal(ping.tcfPolicyVersion, 5);
        let added;
        w.__tcfapi('addEventListener', 2, data => { added = data; });
        assert.equal(added.eventStatus, 'tcloaded');
        assert.equal(typeof added.listenerId, 'number');
        let removed;
        w.__tcfapi('removeEventListener', 2, ok => { removed = ok; },
            added.listenerId);
        assert.equal(removed, true);
    });

    it('adds no GPP where the page shows no sign of it', ( ) => {
        // GPP is a setting of its own on their side, so it does not follow
        // TCF: a page with the TCF stub alone gets the TCF layer only.
        let out;
        const w = withStub({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(w.__gpp, undefined);
        assert.ok(out[0].includes(' gpp=off'), out[0]);
    });

    const withGpp = (options = {}) => withStub(Object.assign({}, options, {
        before: w_ => {
            if ( typeof options.before === 'function' ) { options.before(w_); }
            w_.eval('window.__gppStubCalls = [];' +
                'window.__gpp = function(cmd, cb, p) {' +
                ' if ( cmd === "queue" ) { return window.__gppStubCalls; }' +
                ' window.__gppStubCalls.push([ cmd, cb, p ]);' +
                '};');
        },
    }));

    const gppPing = w => {
        let data;
        w.__gpp('ping', value => { data = value; });
        return data;
    };

    it('answers __gpp with the section the reference parse agrees with', ( ) => {
        let out;
        const w = withGpp({ before: w_ => { out = lines(w_); } }).window;
        assert.ok(out[0].includes(' gpp=refused gppvia=stub'), out[0]);
        const data = gppPing(w);
        assert.equal(data.gppVersion, '1.1');
        assert.equal(data.cmpStatus, 'loaded');
        assert.equal(data.signalStatus, 'ready');
        assert.deepEqual(plain(data.sectionList), [ 2 ]);
        assert.deepEqual(plain(data.applicableSections), [ 2 ]);
        // Theirs, verbatim, even though only the first is carried.
        assert.deepEqual(plain(data.supportedAPIs),
            [ '2:tcfeuv2', '5:tcfcav1', '6:uspv1' ]);
        assert.ok(data.gppString.startsWith('DBABMA~'));

        // The IAB's own library, parsing what this built: every field of the
        // section it reports has to match the one handed to callers.
        const model = new GppModel();
        model.decode(data.gppString);
        assert.deepEqual(model.getSectionIds(), [ 2 ]);
        const reference = JSON.parse(
            JSON.stringify(model.getSection('tcfeuv2'))
        );
        let mine;
        w.__gpp('getSection', value => { mine = value; }, 'tcfeuv2');
        assert.deepEqual(JSON.parse(JSON.stringify(mine)), reference);
        assert.equal(reference.CmpId, 5);
        assert.deepEqual(reference.PurposeConsents, new Array(24).fill(false));
        assert.deepEqual(
            reference.PurposeLegitimateInterests, new Array(24).fill(false)
        );
        assert.deepEqual(reference.VendorConsents, []);
        assert.deepEqual(reference.VendorLegitimateInterests, []);
    });

    it('carries the identity the TCF layer resolved into GPP as well', ( ) => {
        const first = withStub().window;
        const prior = patch(tcData(first).tcString, {
            cmpId: 318, cmpVersion: 1, vendorListVersion: 42, publisherCC: 'DE',
        });
        const w = withGpp({
            before: w_ => {
                w_.localStorage.setItem('uc_tcf', JSON.stringify({
                    acString: '', tcString: prior, timestamp: 1, vendors: [],
                }));
            },
        }).window;
        const data = gppPing(w);
        // Their own API is built with the TCF identity, so this reports it.
        assert.equal(data.cmpId, 318);
        assert.equal(data.cmpVersion, 1);
        const model = new GppModel();
        model.decode(data.gppString);
        assert.equal(model.getSection('tcfeuv2').CmpId, 318);
    });

    it('answers the GPP commands, and refuses the one that is not one', ( ) => {
        const w = withGpp().window;
        const answers = {};
        const take = name => (value, success) => {
            answers[name] = { value, success };
        };
        w.__gpp('hasSection', take('has'), 'tcfeuv2');
        w.__gpp('hasSection', take('hasNot'), 'usnat');
        w.__gpp('getField', take('field'), 'tcfeuv2.PublisherCountryCode');
        w.__gpp('getField', take('noField'), 'tcfeuv2.Nonsense');
        w.__gpp('getGPPData', take('gppData'));
        assert.equal(answers.has.value, true);
        assert.equal(answers.hasNot.value, false);
        assert.equal(answers.field.value, 'AA');
        assert.equal(answers.field.success, true);
        assert.equal(answers.noField.success, false);
        // Not a command in GPP 1.1, and the reference implementation refuses
        // it, so this does too.
        assert.equal(answers.gppData.success, false);
    });

    it('answers what the GPP stub had already been asked', ( ) => {
        // A publisher's stub parks calls until a CMP arrives, and their own
        // CmpApi drains them. One queued before this ran is answered, not
        // left sitting in an array nothing will read again.
        const w = withGpp({
            before: w_ => {
                w_.eval('window.__gppAnswers = [];');
            },
        }).window;
        // Re-stub, queue a ping, then re-run: the same path a real page takes.
        w.eval('window.__gppStubCalls = [];' +
            'window.__gpp = function(cmd, cb, p) {' +
            ' if ( cmd === "queue" ) { return window.__gppStubCalls; }' +
            ' window.__gppStubCalls.push([ cmd, cb, p ]);' +
            '};');
        w.eval('window.__gpp("ping", function(data, ok) {' +
            ' window.__gppAnswers.push([ data && data.cmpStatus, ok ]); });');
        assert.deepEqual(plain(w.__gppAnswers), []);
        w.eval('window.__ucCmp = undefined;');
        w.eval(reject);
        assert.deepEqual(plain(w.__gppAnswers), [ [ 'loaded', true ] ]);
    });

    it('registers and removes a GPP listener', ( ) => {
        const w = withGpp().window;
        let registered;
        w.__gpp('addEventListener', value => { registered = value; });
        assert.equal(registered.eventName, 'listenerRegistered');
        assert.equal(registered.data, true);
        assert.deepEqual(plain(registered.pingData.sectionList), [ 2 ]);
        let removed;
        w.__gpp('removeEventListener', value => { removed = value; },
            registered.listenerId);
        assert.equal(removed.eventName, 'listenerRemoved');
        assert.equal(removed.data, true);
    });

    it('installs GPP off a locator frame, and adds one where there is none',
        ( ) => {
            let out;
            const w = withStub({
                before: w_ => {
                    out = lines(w_);
                    const frame = w_.document.createElement('iframe');
                    frame.name = '__gppLocator';
                    w_.document.body.appendChild(frame);
                },
            }).window;
            assert.ok(out[0].includes(' gppvia=locator'), out[0]);
            assert.equal(typeof w.__gpp, 'function');
            // And where the evidence was the stub instead, the frame their own
            // API creates is created here too, for a cross-frame caller.
            const other = withGpp().window;
            assert.notEqual(other.frames.__gppLocator, undefined);
        }
    );

    it('says GPP has no section to carry without a TCF string', ( ) => {
        // GPP evidence alone: section 2's payload is the TC string, and the US
        // and Canadian sections need a jurisdiction this never learns.
        let out;
        const w = asLoader({
            before: w_ => {
                out = lines(w_);
                w_.eval('window.__gpp = function() {};');
            },
        }).window;
        assert.ok(out[0].includes(' iab=off'), out[0]);
        assert.ok(out[0].includes(' gpp=nosection'), out[0]);
        assert.equal(typeof w.__gpp, 'function');
        let answered = 'untouched';
        w.__gpp('ping', value => { answered = value; });
        // Their stub is left exactly as it was, rather than replaced by one
        // that would answer with an empty string.
        assert.equal(answered, 'untouched');
    });

    it('says no to a command it does not implement', ( ) => {
        const w = withStub().window;
        let answered;
        w.__tcfapi('getInAppTCData', 2, (data, ok) => {
            answered = [ data, ok ];
        });
        assert.deepEqual(plain(answered), [ null, false ]);
    });
});

/******************************************************************************/

describe('filters, usercentrics', ( ) => {
    it('replaces the CMP and leaves the blocker alone', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('usercentrics'));
        const ours = active.filter(line => line.includes('usercentrics-reject'));
        assert.deepEqual(ours, [
            '||cmp.usercentrics.eu/ui/loader.js' +
                '$script,redirect=usercentrics-reject.js',
            // Their v2 CMP, which keeps its record somewhere else.
            '||app.usercentrics.eu/browser-ui/*/loader.js' +
                '$script,redirect=usercentrics-reject.js',
        ]);
        // Their blocker is what enforces the refusal, so no rule may touch it.
        for ( const line of active ) {
            assert.equal(line.includes('uc-block'), false, line);
            assert.equal(line.includes('privacy-proxy'), false, line);
        }
    });

    it('matches the urls their tenants actually serve', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const lines_ = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('usercentrics'));
        const loader = lines_.filter(line => line.includes('usercentrics-reject'));
        for ( const url of [
            'https://web.eu1.cmp.usercentrics.eu/ui/loader.js',
            'https://web.us1.cmp.usercentrics.eu/ui/loader.js',
            'https://app.usercentrics.eu/browser-ui/latest/loader.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/loader.js',
            // An older v2 in the field, whose contract is the same.
            'https://app.usercentrics.eu/browser-ui/3.64.0/loader.js',
        ] ) {
            assert.ok(loader.some(p => matches(p, url)), 'no rule matches ' + url);
        }
        // The chunks the loader would have fetched, which the noop rules cover.
        const noops = lines_.filter(line => line.includes('noopjs'));
        for ( const url of [
            'https://web.eu1.cmp.usercentrics.eu/ui/v/4.20.0/WebSdk.lib.8e67814b.js',
            'https://web.eu1.cmp.usercentrics.eu/ui/v/4.20.0/GdprCmpController.f1f19c11.js',
            'https://web.eu1.cmp.usercentrics.eu/ui/TvGdprCmpView.f7414e25.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/index.module.js',
            'https://app.usercentrics.eu/browser-ui/3.64.0/index.module.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/DefaultData-7f0b0555-acd2e380.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/DefaultUI-2bbb4e62-44e08cee.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/FirstLayerCustomization-28c9b0b9-c05da1fc.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/ButtonsCustomization-34692263-5eed371e.js',
            'https://app.usercentrics.eu/browser-ui/3.108.0/SecondLayerUI-3c2663ff-719b82ee.js',
        ] ) {
            assert.ok(noops.some(p => matches(p, url)), 'no noop rule for ' + url);
        }
        // And none of them matches the blocker, at either of the paths it is
        // served from - a tenant may pin its version - or its translations,
        // which are what the placeholders it leaves behind are written in.
        for ( const url of [
            'https://privacy-proxy.usercentrics.eu/latest/uc-block.bundle.js',
            'https://privacy-proxy.usercentrics.eu/3.3.10/uc-block.bundle.js',
            'https://privacy-proxy.usercentrics.eu/latest/en.json',
        ] ) {
            for ( const pattern of lines_ ) {
                assert.equal(
                    matches(pattern, url), false, pattern + ' matches ' + url
                );
            }
        }
    });
});
