/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.costco.ca/shop';

// The purposes a real tenant carries, in the state their own cookie showed:
// two off, two on, and two of their tri-state "Auto".
const PURPOSES = {
    AlwaysBlock: false,
    SaleOfInfo: false,
    DiRinProgress: 'Auto',
    Advertising: 'Auto',
    Analytics: true,
    Functional: true,
};

// Indiegogo's, which its airgap declares in this order and its own cookie
// carries in the same one: four purposes, none of them the tri-state, and
// none of the names the set above adds.
const IGG_PURPOSES = {
    SaleOfInfo: false,
    Analytics: false,
    Functional: false,
    Advertising: false,
};

// airgap as their own file installs it, with getConsent and setConsent
// behaving as theirs do.
// requireAuth off, so null is proof enough - the shape a tenant has when its
// own consent manager records a choice nobody clicked.
const AIRGAP = airgap('off');

// Their check, as airgap makes it: null passes only where requireAuth is off,
// and otherwise the auth must be a trusted event of type load.
function airgap(requireAuth, purposes = PURPOSES) {
    return 'window.__calls = [];' +
        'window.__purposes = ' + JSON.stringify(purposes) + ';' +
        'window.airgap = Object.assign({ readyQueue: [],' +
        ' ready(c) { this.readyQueue.push(c); } }, window.airgap);' +
        'window.airgap.loadOptions = ' +
        JSON.stringify({ requireAuth }) + ';' +
        'window.airgap.getConsent = function() {' +
        ' return { purposes: Object.assign({}, window.__purposes),' +
        ' confirmed: false, prompted: false, updated: false }; };' +
        'window.airgap.setConsent = function(auth, purposes, options) {' +
        ' window.__calls.push([ auth, purposes, options ]);' +
        ' if ( window.__setConsentResult === false ) { return false; }' +
        ' var ok = ' + (requireAuth === 'off'
            ? 'true'
            : '!!(auth && auth.type === "load" && auth.isTrusted)') + ';' +
        ' if ( ok ) { window.__purposes = purposes; }' +
        ' return ok; };' +
        // Their own signal set, built from the browser's.
        'window.airgap.getPrivacySignals = function() {' +
        ' return new Set(navigator.globalPrivacyControl ? [ "GPC" ] : []); };';
}

// Their ready() once airgap is loaded: the callback runs at once.
const READY_NOW = 'window.airgap.ready = function(c) { c(window.airgap); };';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('transcend-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

// As the ui.js replacement: airgap is there and ready before this runs.
const asUi = (options = {}) => runDom(
    reject, options.url || URL, '<html><body><p id="content">x</p></body></html>',
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
        w.eval(AIRGAP + READY_NOW);
    }
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

/******************************************************************************/

describe('transcend-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('transcend-'));
        assert.deepEqual(names, [ 'transcend-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.transcend + "'"));
    });

    it('refuses every purpose the tenant has, whatever they are called', ( ) => {
        const w = asUi().window;
        assert.equal(w.__calls.length, 1);
        const [ auth, purposes, options ] = w.__calls[0];
        // The names come from their own getConsent, so none has to be known
        // here - and their tri-state "Auto" becomes an explicit no.
        assert.deepEqual(plain(purposes), {
            AlwaysBlock: false,
            SaleOfInfo: false,
            DiRinProgress: false,
            Advertising: false,
            Analytics: false,
            Functional: false,
        });
        // The auth a site's own manager passes when nobody clicked anything.
        assert.equal(auth, null);
        assert.equal(options.confirmed, true);
        assert.equal(options.prompted, true);
        assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(options.timestamp));
    });

    it('refuses a tenant that shares none of those names', ( ) => {
        // Nothing here knows those names; they arrive from their own
        // getConsent, and this set shares only half of them with the other.
        const w = runDom(reject, 'https://www.indiegogo.com/',
            '<html><body><p>x</p></body></html>',
            w_ => { w_.eval(airgap('off', IGG_PURPOSES) + READY_NOW); }
        ).window;
        assert.equal(w.__calls.length, 1);
        assert.deepEqual(plain(w.__calls[0][1]), {
            SaleOfInfo: false,
            Analytics: false,
            Functional: false,
            Advertising: false,
        });
    });

    it('writes the record their own banner writes for a refusal', ( ) => {
        // A genuine cookie from Indiegogo running their banner, with this
        // resource nowhere near it: their UI's own record of a full refusal.
        const theirs = {
            purposes: {
                SaleOfInfo: false,
                Analytics: false,
                Functional: false,
                Advertising: false,
            },
            timestamp: '2026-10-02T01:33:15.268Z',
            confirmed: true,
            prompted: true,
            updated: true,
        };
        const w = runDom(reject, 'https://www.indiegogo.com/',
            '<html><body><p>x</p></body></html>',
            w_ => {
                w_.eval(airgap(undefined, IGG_PURPOSES) + READY_NOW);
                // Their airgap refusing the decision, so the cookie is the
                // only way left to record it.
                w_.eval('window.__setConsentResult = false;');
                Object.defineProperty(w_.document, 'readyState', {
                    value: 'complete',
                    configurable: true,
                });
            }
        ).window;
        const ours = JSON.parse(cookies(w).get('tcm'));
        assert.deepEqual(Object.keys(ours).sort(), Object.keys(theirs).sort());
        assert.deepEqual(ours.purposes, theirs.purposes);
        assert.equal(ours.confirmed, theirs.confirmed);
        assert.equal(ours.prompted, theirs.prompted);
        assert.ok(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(ours.timestamp));
        // The one field that differs, and the only one that may: theirs says
        // the decision replaced an earlier one, this one is the first record.
        // airgap takes it either way - its parser coerces with !!, and their
        // own schema has confirmed and timestamp required with updated
        // optional - and it is reported upstream rather than enforced.
        assert.equal(ours.updated, false);
    });

    it('builds no banner, and leaves airgap to do the blocking', ( ) => {
        const w = asUi().window;
        // Nothing rendered: their ui.js is 390kB of Preact and this is what
        // replaces it.
        assert.equal(w.document.body.children.length, 1);
        assert.equal(w.document.body.firstElementChild.id, 'content');
        // And the engine is untouched, which is the half that enforces this.
        assert.equal(typeof w.airgap.getConsent, 'function');
        assert.equal(typeof w.airgap.setConsent, 'function');
    });

    it('queues itself where it lands before airgap does', ( ) => {
        // Injected as a scriptlet this runs at document_start, when there is no
        // airgap at all. Their own stub shape is what airgap.js spreads over
        // its own definition, so a callback queued here is one it drains.
        const w = runDom(reject, URL, '<html><body><p>x</p></body></html>').window;
        assert.equal(Array.isArray(w.airgap.readyQueue), true);
        assert.equal(w.airgap.readyQueue.length, 1);
        w.eval(AIRGAP);
        assert.equal(w.airgap.readyQueue.length, 1, 'the merge kept the queue');
        w.eval('window.airgap.readyQueue.forEach(function(c) { c(window.airgap); });');
        assert.equal(w.__calls.length, 1);
        assert.deepEqual(plain(w.__calls[0][1]).Analytics, false);
    });

    it('records it with the page own load event where auth is required',
        async ( ) => {
            // Four tenants sampled all leave requireAuth on, so this is the
            // ordinary path: their own load branch takes a trusted load event,
            // which every page fires, and the refusal lands on this page.
            let out;
            const dom = runDom(
                reject, URL, '<html><body><p>x</p></body></html>',
                w_ => {
                    out = lines(w_);
                    w_.eval(airgap(undefined) + READY_NOW);
                }
            );
            const w = dom.window;
            // Nothing recorded yet, and nothing said: it is waiting for load.
            assert.equal(w.__calls.length, 0);
            await settle(120);
            assert.equal(w.__calls.length, 1);
            const [ auth, purposes ] = w.__calls[0];
            assert.equal(auth.type, 'load');
            assert.equal(auth.isTrusted, true);
            assert.deepEqual(plain(purposes).Analytics, false);
            assert.ok(out[0].endsWith(' via=load'), out[0]);
            // Their API took it, so their cookie is theirs to write.
            assert.equal(cookies(w).has('tcm'), false);
        }
    );

    it('asks for no proof it does not need, where auth is off', ( ) => {
        let out;
        const w = asUi({ before: w_ => { out = lines(w_); } }).window;
        // One attempt, with null, and no waiting: asking their loadOptions
        // first keeps their own "Authorization proof is untrusted" out of the
        // console everywhere else.
        assert.equal(w.__calls.length, 1);
        assert.equal(w.__calls[0][0], null);
        assert.ok(out[0].endsWith(' via=setConsent'), out[0]);
    });

    it('falls back to their cookie if that event is refused as well', async ( ) => {
        let out;
        const dom = runDom(reject, URL, '<html><body><p>x</p></body></html>',
            w_ => {
                out = lines(w_);
                w_.eval(airgap(undefined) + READY_NOW);
                // A tenant whose airgap will not take it even then.
                w_.eval('window.__setConsentResult = false;');
            }
        );
        const w = dom.window;
        await settle(120);
        // It tried with the load event, was refused, and wrote their cookie.
        assert.equal(w.__calls.length, 1);
        assert.equal(w.__calls[0][0].type, 'load');
        assert.ok(out[0].endsWith(' via=cookie'), out[0]);
        assert.deepEqual(JSON.parse(cookies(w).get('tcm')).purposes.Analytics, false);
    });

    it('falls back to their cookie once that event has gone', ( ) => {
        let out;
        // Injected after load, which is the one case where their load branch
        // is out of reach.
        const dom = runDom(reject, URL, '<html><body><p>x</p></body></html>',
            w_ => {
                out = lines(w_);
                w_.eval(airgap(undefined) + READY_NOW);
                Object.defineProperty(w_.document, 'readyState', {
                    value: 'complete',
                    configurable: true,
                });
            }
        );
        const w = dom.window;
        assert.ok(out[0].endsWith(' via=cookie'), out[0]);
        const record = JSON.parse(cookies(w).get('tcm'));
        assert.equal(record.confirmed, true);
        assert.deepEqual(record.purposes.Analytics, false);
    });

    it('writes their cookie where a tenant will not take it programmatically',
        ( ) => {
            let out;
            const w = asUi({
                before: w_ => {
                    out = lines(w_);
                    // What their airgap answers when it will not take this at
                    // all: refused, with a message of its own.
                    w_.eval('window.__setConsentResult = false;');
                    Object.defineProperty(w_.document, 'readyState', {
                        value: 'complete',
                        configurable: true,
                    });
                },
            }).window;
            assert.ok(out[0].endsWith(' via=cookie'), out[0]);
            const record = JSON.parse(cookies(w).get('tcm'));
            assert.deepEqual(record.purposes, {
                AlwaysBlock: false,
                SaleOfInfo: false,
                DiRinProgress: false,
                Advertising: false,
                Analytics: false,
                Functional: false,
            });
            assert.equal(record.confirmed, true);
            assert.equal(record.prompted, true);
            assert.equal(record.updated, false);
            assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(record.timestamp));
        }
    );

    it('writes no cookie when their API took the refusal', ( ) => {
        const w = asUi().window;
        // Their airgap owns that cookie; where it accepted the decision there
        // is nothing here to write.
        assert.equal(cookies(w).has('tcm'), false);
    });

    it('says nothing to refuse where a tenant has no purposes', ( ) => {
        let out;
        // Its own airgap, rather than the fixture's: this one has no purposes
        // at all, which is what a notice-only tenant looks like.
        const w = runDom(
            reject, URL, '<html><body><p>x</p></body></html>',
            w_ => {
                out = lines(w_);
                w_.eval('window.airgap = { getConsent() { return { purposes: {} }; },' +
                    ' setConsent() { window.__called = true; return true; },' +
                    ' ready(c) { c(this); } };');
            }
        ).window;
        assert.ok(out[0].endsWith(' refused=(none) via=nothing to refuse'), out[0]);
        assert.equal(w.__called, undefined);
        assert.equal(cookies(w).has('tcm'), false);
    });

    it('leaves the privacy signals to airgap, which is whose they are', ( ) => {
        // airgap builds its own signal set from navigator.globalPrivacyControl
        // and doNotTrack, and applies it per purpose from the tenant's config -
        // a purpose whose defaultConsent is "Auto" follows the signal. Setting
        // every purpose to an explicit false is at or below whatever that would
        // reach, so there is nothing here for the signal to change.
        const withSignal = asUi({
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true,
                    configurable: true,
                });
            },
        }).window;
        const without = asUi().window;
        const sent = w => {
            const [ , purposes, options ] = w.__calls[0];
            const copy = plain(options);
            delete copy.timestamp;
            return JSON.stringify([ plain(purposes), copy ]);
        };
        assert.equal(sent(withSignal), sent(without));
        assert.deepEqual(plain(withSignal.__calls[0][1]).Advertising, false);
        // And the signal itself is still airgap's to report, untouched: a site
        // reading it still sees GPC, which is how a site's own notice about
        // having honoured it keeps working.
        assert.deepEqual(
            Array.from(withSignal.airgap.getPrivacySignals()),
            [ 'GPC' ]
        );
        assert.deepEqual(Array.from(without.airgap.getPrivacySignals()), []);
    });

    it('says on the console what it did', ( ) => {
        let out;
        const w = asUi({ before: w_ => { out = lines(w_); } }).window;
        assert.equal(out.length, 1);
        assert.equal(out[0],
            '[consent-rr] transcend-reject ' + versions.transcend +
            ' refused=AlwaysBlock,SaleOfInfo,DiRinProgress,Advertising,' +
            'Analytics,Functional via=setConsent'
        );
        assert.equal(w.airgap.consentRR.mode, 'reject');
        assert.equal(w.airgap.consentRR.version, versions.transcend);
    });

    it('does nothing the second time it is injected', ( ) => {
        const dom = asUi();
        const w = dom.window;
        const out = lines(w);
        w.eval(reject);
        assert.deepEqual(out, []);
        assert.equal(w.__calls.length, 1);
    });
});

/******************************************************************************/

describe('filters, transcend', ( ) => {
    const active = filtersText.split('\n')
        .filter(line => line.startsWith('!') === false)
        .join('\n');

    it('replaces the banner and leaves the engine alone', ( ) => {
        const ours = active.split('\n')
            .filter(line => line.includes('transcend-reject'));
        // Both of the names their builds give the banner, and a path that
        // covers /cm/ and the /cm-test/ Airtable is served from.
        assert.deepEqual(ours, [
            '||transcend-cdn.com/cm*/*/ui.js$script,redirect=transcend-reject.js',
            '||transcend-cdn.com/cm*/*/uiV2.js$script,redirect=transcend-reject.js',
            // A tenant serving the bundle from its own assets, which no rule
            // above can reach.
            '||assets.mayoclinic.org/content/dam/cpm-transcend/ui.js' +
                '$script,redirect=transcend-reject.js',
        ]);
        // airgap.js is the engine, and the thing that enforces the refusal.
        assert.equal(active.includes('airgap.js'), false);
    });

    it('matches the urls both kinds of build actually serve', ( ) => {
        // uBO's own pattern rules: || is a host anchor and * spans anything,
        // including a path separator.
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const patterns = active.split('\n')
            .filter(line => line.includes('transcend-reject'));
        const urls = [
            'https://transcend-cdn.com/cm/27549f25-ae97-4ab1-93cc-40599429e806/ui.js',
            'https://transcend-cdn.com/cm-test/619e6e3b-1a5c-4516-be11-6d77bdcbd717/uiV2.js',
            // ef49a3f1 names its ui relatively, "ui.js", which resolves here.
            'https://transcend-cdn.com/cm/ef49a3f1-d8c1-47d6-88fc-50e41130631f/ui.js',
            // And one served from the tenant's own assets.
            'https://assets.mayoclinic.org/content/dam/cpm-transcend/ui.js',
        ];
        for ( const url of urls ) {
            assert.ok(
                patterns.some(pattern => matches(pattern, url)),
                'no rule matches ' + url
            );
        }
        // And the engine is matched by none of them.
        for ( const pattern of patterns ) {
            assert.equal(
                matches(pattern, 'https://transcend-cdn.com/cm/x/airgap.js'),
                false,
                pattern + ' matches airgap.js'
            );
        }
    });
});
