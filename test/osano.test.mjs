/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.lucid.co/pricing';
const PAGE = '<html lang="en"><head></head><body><p id="content">x</p></body></html>';

// The bootstrap a page may carry before the script lands, which is the one
// osano.js installs for itself: a function that parks its arguments.
const STUB = 'window.Osano = window.Osano || function() {' +
    ' window.Osano.data.push(arguments); };' +
    'window.Osano.data = window.Osano.data || [];';

const KEY = 'osano_consentmanager';
const REFUSED = {
    ESSENTIAL: 'ACCEPT',
    STORAGE: 'DENY',
    MARKETING: 'DENY',
    PERSONALIZATION: 'DENY',
    ANALYTICS: 'DENY',
    OPT_OUT: 'DENY',
};

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('osano-reject.js');
});

const boot = (options = {}) => runDom(
    reject,
    options.url || URL,
    options.html || PAGE,
    w => {
        if ( options.stub !== false ) { w.eval(STUB); }
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

// jsdom objects come from another realm, where deepStrictEqual refuses to
// compare them. A round trip through JSON lands them in this one.
const plain = value => JSON.parse(JSON.stringify(value));

const stored = (w, name = KEY) => w.localStorage.getItem(name);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

/******************************************************************************/

describe('osano-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('osano-'));
        // One resource: a refusal, and their own default state is already one.
        assert.deepEqual(names, [ 'osano-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.osano + "'"));
    });

    it('answers as their own default state does: essential only', ( ) => {
        const w = boot().window;
        assert.equal(typeof w.Osano, 'function');
        assert.deepEqual(plain(w.Osano.cm.getConsent()), REFUSED);
        assert.equal(w.Osano.cm.analytics, false);
        assert.equal(w.Osano.cm.marketing, false);
        assert.equal(w.Osano.cm.personalization, false);
        assert.equal(w.Osano.cm.optOut, false);
        // The deprecated accessor their code still carries.
        assert.deepEqual(plain(w.Osano.cm.storage.getConsent()), REFUSED);
    });

    it('asserts the opt-out under Global Privacy Control, as theirs does', ( ) => {
        const w = boot({
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true,
                    configurable: true,
                });
            },
        }).window;
        assert.equal(w.Osano.cm.getConsent().OPT_OUT, 'ACCEPT');
        assert.equal(w.Osano.cm.optOut, true);
        // Everything else is refused either way.
        assert.equal(w.Osano.cm.marketing, false);
        let usp;
        w.__uspapi('getUSPData', 1, value => { usp = value; });
        assert.equal(usp.uspString, '1-Y-');
    });

    it('answers what the page parked before it arrived', async ( ) => {
        const w = boot({
            before: w_ => {
                w_.saw = [];
                w_.eval(
                    'Osano("onInitialized", function(c) {' +
                    ' window.saw.push(["init", JSON.stringify(c)]); });' +
                    'Osano("onConsentSaved", function(c) {' +
                    ' window.saw.push(["saved", JSON.stringify(c)]); });' +
                    'Osano("locale", "fr");'
                );
            },
        }).window;
        // A property set rather than a listener, and their own mapping of
        // "onInitialized" to the osano-cm-initialized event.
        assert.equal(w.Osano.cm.locale, 'fr');
        assert.deepEqual(plain(w.saw)[0], [ 'init', JSON.stringify(REFUSED) ]);
        // Theirs answers a consent-saved listener a frame later, not inline.
        assert.equal(w.saw.length, 1);
        await settle(30);
        assert.deepEqual(plain(w.saw)[1], [ 'saved', JSON.stringify(REFUSED) ]);
    });

    it('keeps answering calls made after it ran', async ( ) => {
        const w = boot().window;
        w.saw = [];
        w.eval(
            'Osano("onInitialized", function(c) {' +
            ' window.saw.push(["init", JSON.stringify(c)]); });' +
            'Osano("onUiChanged", function() { window.saw.push(["ui"]); });'
        );
        assert.deepEqual(plain(w.saw), [ [ 'init', JSON.stringify(REFUSED) ] ]);
        // Their queue is drained and left empty, not appended to.
        assert.equal(w.Osano.data.length, 0);
        await settle(30);
        // A ui event needs a banner to change, and there is none.
        assert.equal(w.saw.length, 1);
    });

    it('never fires the events a refusal does not earn', async ( ) => {
        const w = boot().window;
        const fired = [];
        for ( const name of [
            'osano-cm-marketing', 'osano-cm-analytics',
            'osano-cm-personalization', 'osano-cm-storage', 'osano-cm-opt-out',
        ] ) {
            w.Osano.cm.addEventListener(name, ( ) => { fired.push(name); });
        }
        await settle(30);
        assert.deepEqual(fired, []);
    });

    it('answers a consent-saved listener once for each registration', async ( ) => {
        const w = boot().window;
        const seen = [];
        const listener = ( ) => { seen.push('saved'); };
        w.Osano.cm.addEventListener('osano-cm-consent-saved', listener);
        w.Osano.cm.removeEventListener('osano-cm-consent-saved', listener);
        assert.equal(seen.length, 0);
        // on and off are their aliases for the same two methods.
        w.Osano.cm.on('osano-cm-consent-saved', listener);
        w.Osano.cm.off('osano-cm-consent-saved', listener);
        // Taking a listener off does not call back the answer already queued
        // for it, in their code either: the frame it waits for is not cancelled.
        await settle(30);
        assert.equal(seen.length, 2);
        // And removing what was never added is not an error.
        w.Osano.cm.removeEventListener('osano-cm-marketing', listener);
        w.Osano.cm.removeEventListener('osano-cm-consent-saved', ( ) => {});
    });

    it('stores their record, verbatim in localStorage', ( ) => {
        const dom = boot();
        const w = dom.window;
        const record = JSON.parse(stored(w));
        assert.deepEqual(record.consent, REFUSED);
        assert.ok(Number.isInteger(record.consentTimestamp));
        assert.ok(record.consentTimestamp > 0);
        assert.ok(/^[0-9a-f-]{36}$/.test(stored(w, KEY + '_uuid')));
    });

    it('clears the expiry key a previous load left, as their save does', ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem(KEY + '_expdate', '1700000000000');
                w_.document.cookie = KEY + '_expdate=1700000000000; path=/';
            },
        }).window;
        assert.equal(stored(w, KEY + '_expdate'), null);
        assert.equal(cookies(w).has(KEY + '_expdate'), false);
    });

    it('mirrors it into a cookie a server can still parse', ( ) => {
        const dom = boot();
        const w = dom.window;
        const value = cookies(w).get(KEY);
        // Percent-encoded, unlike theirs: a quote or comma sent raw in a Cookie
        // header is what a strict server-side parser refuses.
        assert.equal(/[",]/.test(value), false);
        assert.equal(decodeURIComponent(value), stored(w));
        const found = cookiesInJar(dom, URL, KEY);
        assert.equal(found.length, 1);
        // Their own scope: the registered domain, path /, a year.
        assert.equal(found[0].domain, 'lucid.co');
        assert.equal(Boolean(found[0].hostOnly), false);
        assert.equal(found[0].path, '/');
        assert.equal(found[0].maxAge, 31536000);
    });

    it('keeps the decision a previous load stored', ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem(KEY, JSON.stringify({
                    consent: REFUSED,
                    consentTimestamp: 1700000000000,
                }));
                w_.localStorage.setItem(KEY + '_uuid', 'kept-across-visits');
            },
        }).window;
        const record = JSON.parse(stored(w));
        assert.equal(record.consentTimestamp, 1700000000000);
        assert.equal(stored(w, KEY + '_uuid'), 'kept-across-visits');
        assert.equal(w.Osano.consentRR.uuid, 'kept-across-visits');
    });

    it('replaces a record it cannot read, rather than trusting it', ( ) => {
        const w = boot({
            before: w_ => {
                // What their own writer leaves: the record, encrypted.
                w_.localStorage.setItem(KEY, 'U2FsdGVkX1+not+json+at+all');
            },
        }).window;
        const record = JSON.parse(stored(w));
        assert.deepEqual(record.consent, REFUSED);
        assert.ok(record.consentTimestamp > 1700000000000);
    });

    it('signals Google consent mode the way theirs does', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval('window.gtag = function() {' +
                    ' (window.calls = window.calls || [])' +
                    '.push(Array.prototype.slice.call(arguments)); };');
            },
        }).window;
        assert.deepEqual(plain(w.calls), [ [ 'consent', 'default', {
            security_storage: 'granted',
            functionality_storage: 'granted',
            analytics_storage: 'denied',
            personalization_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
        } ] ]);
        // Their own developer id, and only once.
        assert.deepEqual(plain(w.dataLayer), [
            [ 'set', 'developer_id.dMzRlOT', true ],
        ]);
    });

    it('leaves a consent-mode default the page sent alone', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval('window.gtag = function() {' +
                    ' (window.calls = window.calls || [])' +
                    '.push(Array.prototype.slice.call(arguments));' +
                    ' window.dataLayer.push(arguments); };' +
                    'window.dataLayer = window.dataLayer || [];' +
                    // What the page this was read off sends for itself, before
                    // the CMP lands.
                    'gtag("consent", "default", { ad_storage: "denied",' +
                    ' wait_for_update: 500 });');
            },
        }).window;
        // Theirs skips its own default where one is already in the layer, and
        // consent mode takes the first one either way.
        assert.equal(w.calls.length, 1);
        assert.equal(plain(w.calls)[0][2].wait_for_update, 500);
        // The developer id still goes in, as it does in their own order.
        assert.ok(plain(w.dataLayer).some(entry => entry[1] === 'developer_id.dMzRlOT'));
    });

    it('does not repeat a developer id already in the layer', ( ) => {
        const w = boot({
            before: w_ => {
                w_.eval('window.dataLayer = [ [ "set",' +
                    ' "developer_id.dMzRlOT", true ] ];');
            },
        }).window;
        const marked = plain(w.dataLayer)
            .filter(entry => entry[1] === 'developer_id.dMzRlOT');
        assert.equal(marked.length, 1);
    });

    it('loses the signal quietly where the page has no gtag, as theirs does',
        ( ) => {
            const w = boot().window;
            assert.equal(typeof w.gtag, 'undefined');
            // The record still went in.
            assert.deepEqual(JSON.parse(stored(w)).consent, REFUSED);
        }
    );

    it('answers the CCPA API their bundle installs', ( ) => {
        const w = boot().window;
        assert.equal(typeof w.__uspapi, 'function');
        const answers = [];
        w.__uspapi('getUSPData', 1, (value, success) => {
            answers.push([ plain(value), success ]);
        });
        w.__uspapi('getUSPData', 2, (value, success) => {
            answers.push([ value, success ]);
        });
        assert.deepEqual(answers[0], [ { version: 1, uspString: '1---' }, true ]);
        assert.deepEqual(answers[1], [ null, false ]);
        // Two commands beyond the published API, which their bundle carries.
        assert.equal(w.__uspapi('getField', 1, undefined, 'OptOutSale'), '-');
        assert.equal(w.__uspapi('getField', 1, undefined, 'Version'), 1);
        assert.deepEqual(plain(w.__uspapi('getSection', 1)), [
            { version: 1, uspString: '1---' },
        ]);
        assert.equal(
            w.document.querySelectorAll('iframe[name="__uspapiLocator"]').length,
            1
        );
        // A page that already has one - another CMP's, or their own from an
        // earlier load - must not end up with two.
        const already = boot({
            html: '<html><body><iframe name="__uspapiLocator"></iframe>' +
                '<p>x</p></body></html>',
        }).window;
        assert.equal(
            already.document
                .querySelectorAll('iframe[name="__uspapiLocator"]').length,
            1
        );
    });

    it('answers a framed vendor over postMessage', ( ) => {
        const w = boot().window;
        const replies = [];
        const source = { postMessage(response) { replies.push(response); } };
        const post = data => {
            const event = new w.MessageEvent('message', {
                data,
                origin: 'https://vendor.example',
            });
            // jsdom will not take a stand-in window as the event source.
            Object.defineProperty(event, 'source', { value: source });
            w.dispatchEvent(event);
        };
        post({ __uspapiCall: { command: 'getUSPData', version: 1, callId: 'a' } });
        assert.equal(replies[0].__uspapiReturn.callId, 'a');
        assert.equal(replies[0].__uspapiReturn.success, true);
        assert.equal(replies[0].__uspapiReturn.returnValue.uspString, '1---');
        post(JSON.stringify({
            __uspapiCall: { command: 'getUSPData', version: 1, callId: 2 },
        }));
        assert.equal(typeof replies[1], 'string');
        assert.equal(JSON.parse(replies[1]).__uspapiReturn.callId, 2);
    });

    it('has no interface to open, and says so', ( ) => {
        const w = boot().window;
        assert.equal(w.Osano.cm.drawerOpen, false);
        assert.equal(w.Osano.cm.dialogOpen, false);
        // A cookie-preferences link calls these. Nothing to show, nothing thrown.
        for ( const name of [
            'showDialog', 'hideDialog', 'showDrawer', 'hideDrawer',
            'showWidget', 'hideWidget', 'showOptOutWidget', 'hideOptOutWidget',
            'showDoNotSell', 'hideDoNotSell', 'render', 'ready',
        ] ) {
            assert.equal(typeof w.Osano.cm[name], 'function', name);
            w.Osano.cm[name]();
        }
        assert.equal(w.Osano.cm.drawerOpen, false);
    });

    it('claims nothing about the tenant it cannot know', ( ) => {
        const w = boot().window;
        // The jurisdiction comes from a location lookup, the rest from the
        // tenant's own configuration.
        assert.equal(w.Osano.cm.jurisdiction, '');
        assert.equal(w.Osano.cm.countryCode, '');
        assert.equal(w.Osano.cm.cmpContentHash, '');
        assert.equal(w.Osano.cm.revision, 0);
        assert.equal(w.Osano.cm.publishTimestamp, 0);
        // The protective answer where it cannot be known.
        assert.equal(w.Osano.cm.gdprApplies, true);
        assert.equal(w.Osano.cm.consentModel, 'explicit');
        assert.equal(w.Osano.cm.mode, 'production');
    });

    it('says on the console what went in', ( ) => {
        let out;
        const w = boot({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(out.length, 1);
        assert.equal(out[0],
            '[consent-rr] osano-reject ' + versions.osano +
            ' consent=ESSENTIAL' +
            ' denied=STORAGE,MARKETING,PERSONALIZATION,ANALYTICS,OPT_OUT' +
            ' usp=1--- cookie=written'
        );
        assert.equal(w.Osano.consentRR.mode, 'reject');
        assert.equal(w.Osano.consentRR.version, versions.osano);
    });

    it('does nothing the second time it is injected', async ( ) => {
        const dom = boot();
        const w = dom.window;
        const before_ = stored(w);
        const out = lines(w);
        w.eval(reject);
        assert.deepEqual(out, []);
        assert.equal(stored(w), before_);
        assert.equal(
            w.document.querySelectorAll('iframe[name="__uspapiLocator"]').length,
            1
        );
    });

    it('works on a page carrying no bootstrap of its own', ( ) => {
        const w = boot({ stub: false }).window;
        assert.equal(typeof w.Osano, 'function');
        assert.deepEqual(plain(w.Osano.cm.getConsent()), REFUSED);
        // And the function it installs still parks, then handles, a later call.
        w.saw = [];
        w.eval('Osano("onInitialized", function() { window.saw.push(1); });');
        assert.equal(w.saw.length, 1);
    });
});

/******************************************************************************/

describe('filters, osano', ( ) => {
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    it('replaces the one file the whole CMP ships in', ( ) => {
        const ours = active.split('\n').filter(line => line.includes('osano-reject'));
        assert.ok(ours.length !== 0);
        for ( const line of ours ) {
            assert.ok(/cmp\.osano\.com|\+js\(/.test(line),
                'the redirect belongs on cmp.osano.com: ' + line);
        }
        assert.ok(active.includes('/osano.js$script,redirect=osano-reject.js'));
    });
});
