/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { filtersText, loadResources, runDom, versions } from './helpers.mjs';

const URL = 'https://www.jobscan.co/';

// Their entry, and the tags their auto-blocker parks: the real url in
// data-src, scripts typed text/plain, and the category list on the element.
const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="https://app.termly.io/resource-blocker/' +
    '64bc9ee4-ef55-4cbe-b0ae-78a06a508235?autoBlock=on"></script>' +
    '</head><body>' +
    '<script id="ess" type="text/plain" data-categories="essential"' +
    ' data-src="https://e.test/e.js" data-autoblocked="1"></script>' +
    '<script id="ads" type="text/plain" data-categories="advertising"' +
    ' data-src="https://a.test/a.js" data-autoblocked="1"></script>' +
    '<script id="both" type="text/plain" data-categories="essential,analytics"' +
    ' data-src="https://b.test/b.js" data-autoblocked="1"></script>' +
    '<iframe id="emb" data-categories="social_networking"' +
    ' data-src="https://s.test/s" style="display:none"></iframe>' +
    '<p id="content">x</p></body></html>';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('termly-reject.js');
});

const plain = value => JSON.parse(JSON.stringify(value));

const boot = (options = {}) => runDom(
    reject, options.url || URL, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(line); };
    return out;
};

const record = w => JSON.parse(
    w.localStorage.getItem('TERMLY_API_CACHE')
).TERMLY_COOKIE_CONSENT;

const node = (w, id) => w.document.getElementById(id);

/******************************************************************************/

describe('termly-reject', ( ) => {
    it('ships as one resource, in the format uBO parses', async ( ) => {
        const names = Array.from((await loadResources()).keys())
            .filter(name => name.startsWith('termly-'));
        assert.deepEqual(names, [ 'termly-reject.js' ]);
        assert.equal(/^[ \t]*$/m.test(reject), false);
        assert.equal(/[^\x20-\x7e\t\n]/.test(reject), false);
        assert.ok(reject.includes("const VERSION = '" + versions.termly + "'"));
    });

    it('writes their refusal where they read it from', ( ) => {
        const w = boot().window;
        const entry = record(w);
        assert.equal(typeof entry.createdAt, 'number');
        // true is consented in their model - their own isAllDeclined() reads
        // every(c => c === essential || !state[c]) - so this is their OPT_IN
        // constant, which is the refusal.
        assert.deepEqual(plain(entry.value), {
            do_not_sell: true,
            advertising: false,
            analytics: false,
            essential: true,
            performance: false,
            social_networking: false,
            unclassified: false,
        });
    });

    it('keeps the rest of their cache, and the document version in it', ( ) => {
        const w = boot({
            before: w_ => {
                w_.localStorage.setItem('TERMLY_API_CACHE', JSON.stringify({
                    SOMETHING_ELSE: { createdAt: 1, value: { keep: true } },
                    TERMLY_COOKIE_CONSENT: {
                        createdAt: 2,
                        value: { essential: true, analytics: true,
                            document_version_id: 7373 },
                    },
                }));
            },
        }).window;
        const cache = JSON.parse(w.localStorage.getItem('TERMLY_API_CACHE'));
        // Their writer merges, so the entries beside this one survive.
        assert.deepEqual(plain(cache.SOMETHING_ELSE.value), { keep: true });
        // And the version already recorded against the consent is carried.
        assert.equal(cache.TERMLY_COOKIE_CONSENT.value.document_version_id, 7373);
        // What the visitor had consented to is revoked.
        assert.equal(cache.TERMLY_COOKIE_CONSENT.value.analytics, false);
    });

    it('releases what they never block, and parks the rest', ( ) => {
        const w = boot().window;
        // Their release: the url back, a script retyped, the markers gone.
        assert.equal(node(w, 'ess').getAttribute('type'), 'text/javascript');
        assert.equal(node(w, 'ess').getAttribute('src'), 'https://e.test/e.js');
        assert.equal(node(w, 'ess').hasAttribute('data-src'), false);
        assert.equal(node(w, 'ess').hasAttribute('data-autoblocked'), false);
        // Still parked, and still holding its url out of reach.
        assert.equal(node(w, 'ads').getAttribute('type'), 'text/plain');
        assert.equal(node(w, 'ads').hasAttribute('src'), false);
        assert.equal(node(w, 'ads').getAttribute('data-src'), 'https://a.test/a.js');
        assert.equal(node(w, 'emb').hasAttribute('src'), false);
    });

    it('releases an element naming essential among others, as theirs does',
        ( ) => {
            // Their filter is some(), not every(), so a tag marked
            // essential,analytics goes in on their essentials path too. That
            // is their behaviour rather than a choice made here.
            const w = boot().window;
            assert.equal(node(w, 'both').getAttribute('src'), 'https://b.test/b.js');
            assert.equal(node(w, 'both').getAttribute('type'), 'text/javascript');
        }
    );

    it('sends their denied consent mode, the way their gtag sends it', ( ) => {
        const w = boot().window;
        const entries = Array.from(w.dataLayer);
        // The arguments object, not an array of it, for the gtag calls.
        assert.equal(Array.isArray(entries[0]), false);
        assert.deepEqual(plain(Array.from(entries[0])),
            [ 'set', 'developer_id.dNzg2MD', true ]);
        assert.deepEqual(plain(Array.from(entries[1])), [
            'consent', 'default', {
                ad_personalization: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                analytics_storage: 'denied',
                functionality_storage: 'denied',
                personalization_storage: 'denied',
                // Theirs grants this one alone, because it maps to the
                // category they never block.
                security_storage: 'granted',
                social_storage: 'denied',
                unclassified_storage: 'denied',
            },
        ]);
        // Then the two events theirs pushes after a decision.
        assert.deepEqual(plain(entries[2]), {
            event: 'userPrefUpdate',
            cookiesAccepted: [ 'essential' ],
            termlyConsentSettings: plain(record(w).value),
        });
        assert.deepEqual(plain(entries[3]), { event: 'Termly.consentSaveDone' });
    });

    it('sends nothing to the data layer where the page forbids it', ( ) => {
        let out;
        const w = boot({
            before: w_ => {
                out = lines(w_);
                w_.eval('window.TERMLY_FORCE_DISABLE_GCM = true;');
            },
        }).window;
        // Their own switch, which this honours.
        assert.equal(w.dataLayer, undefined);
        assert.ok(out[0].includes(' gcm=disabled'), out[0]);
    });

    it('answers the API a page calls, with the refusal', ( ) => {
        const w = boot().window;
        assert.equal(typeof w.Termly, 'object');
        assert.deepEqual(plain(w.Termly.getConsentState()), plain(record(w).value));
        assert.equal(w.Termly.isGCMConsentLate(), false);
        assert.equal(w.Termly.checkConsentLoadOrder(), undefined);
    });

    it('grants nothing when the page calls consentAll', async ( ) => {
        const w = boot().window;
        // Theirs grants every category. This one cannot - not in what it
        // stored, and not in what it answers afterwards either.
        await w.Termly.consentAll();
        assert.equal(record(w).value.advertising, false);
        assert.equal(w.Termly.getConsentState().advertising, false);
        assert.equal(w.Termly.getConsentState().analytics, false);
        assert.equal(node(w, 'ads').getAttribute('type'), 'text/plain');
        // And a listener registered after it still hears a refusal.
        w.eval('window.__after = [];' +
            'window.Termly.on("consent", function(d) {' +
            ' window.__after.push(d.consentState.advertising); });');
        assert.deepEqual(plain(w.__after), [ false ]);
    });

    it('answers a consent listener registered after the fact', ( ) => {
        const w = boot().window;
        w.eval('window.__seen = [];' +
            'window.Termly.on("consent", function(detail) {' +
            ' window.__seen.push([ detail.consentState.essential,' +
            '  detail.consentState.advertising ]); });');
        // The event has already happened, so a listener arriving later is
        // answered rather than left waiting for one that will not come again.
        assert.deepEqual(plain(w.__seen), [ [ true, false ] ]);
        w.eval('window.Termly.off("consent", function(){});');
    });

    it('calls the whitelist hook a page may define', ( ) => {
        const seen = [];
        boot({
            before: w_ => {
                w_.__seen = seen;
                w_.eval('window.getUpdatedCookieWhitelistByTermly =' +
                    ' function(arg) { window.__seen.push(arg.categories); };');
            },
        });
        assert.equal(seen.length, 1);
        assert.equal(plain(seen[0]).essential, true);
        assert.equal(plain(seen[0]).analytics, false);
    });

    it('adds no TCF api where the page shows no sign of one', ( ) => {
        let out;
        const w = boot({ before: w_ => { out = lines(w_); } }).window;
        // Whether a tenant has that framework on is in the configuration this
        // replaced, so a page with neither stub nor locator gets nothing.
        assert.equal(w.__tcfapi, undefined);
        assert.ok(out[0].includes(' tcf=off'), out[0]);
    });

    it('answers a TCF stub the way their own disabled CMP does', ( ) => {
        let out;
        const w = boot({
            before: w_ => {
                out = lines(w_);
                w_.eval('window.__tcfapi = function(cmd, v, cb) {' +
                    ' if ( cmd === "ping" ) { cb({ gdprApplies: true }); } };');
            },
        }).window;
        assert.ok(out[0].includes(' tcf=disabled/stub'), out[0]);
        let ping;
        w.__tcfapi('ping', 2, data => { ping = data; });
        // Theirs, field for field: an error rather than a string invented for
        // a framework this tenant may not even have enabled.
        assert.equal(ping.cmpId, 412);
        assert.equal(ping.cmpVersion, 1);
        assert.equal(ping.cmpStatus, 'error');
        assert.equal(ping.cmpLoaded, false);
        assert.equal(ping.displayStatus, 'disabled');
        // And whatever the page's own stub had said about GDPR is kept.
        assert.equal(ping.gdprApplies, true);
        let other;
        w.__tcfapi('getTCData', 2, (data, ok) => { other = [ data, ok ]; });
        assert.deepEqual(plain(other), [ null, false ]);
    });

    it('does nothing the second time it is injected', ( ) => {
        const w = boot().window;
        const stored = w.localStorage.getItem('TERMLY_API_CACHE');
        const pushes = w.dataLayer.length;
        w.eval(reject);
        assert.equal(w.localStorage.getItem('TERMLY_API_CACHE'), stored);
        assert.equal(w.dataLayer.length, pushes);
    });

    it('says on the console what it did', ( ) => {
        let out;
        boot({ before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.equal(
            out[0],
            '[consent-rr] termly-reject ' + versions.termly +
            ' consented=essential' +
            ' denied=advertising,analytics,performance,social_networking,unclassified' +
            ' dns=true gcm=denied freed=2 api=ready tcf=off cache=written'
        );
    });

    it('refuses the same with GPC on, which changes only their side', ( ) => {
        const w = boot({
            before: w_ => {
                Object.defineProperty(w_.navigator, 'globalPrivacyControl', {
                    value: true, configurable: true,
                });
            },
        }).window;
        // Their own code reads the signal: in a region where their CMP is off
        // it releases essentials only and forces denied consent-mode defaults,
        // which is what this does with or without it.
        assert.deepEqual(plain(record(w).value.advertising), false);
        assert.equal(node(w, 'ads').getAttribute('type'), 'text/plain');
    });
});

/******************************************************************************/

describe('filters, termly', ( ) => {
    it('replaces the blocker and leaves their documents alone', ( ) => {
        const active = filtersText.split('\n')
            .filter(line => line !== '' && line.startsWith('!') === false)
            .filter(line => line.includes('termly'));
        assert.deepEqual(active, [
            '||app.termly.io/resource-blocker/$script,redirect=termly-reject.js',
        ]);
    });

    it('matches both url forms, and not their embed', ( ) => {
        const matches = (pattern, url) => {
            const body = pattern.slice(2, pattern.indexOf('$'));
            const re = new RegExp(
                '^https?://([^/]*\\.)?' +
                body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
            );
            return re.test(url);
        };
        const rules = filtersText.split('\n')
            .filter(line => line.startsWith('||') && line.includes('termly'));
        const uuid = '64bc9ee4-ef55-4cbe-b0ae-78a06a508235';
        for ( const url of [
            'https://app.termly.io/resource-blocker/' + uuid + '?autoBlock=on',
            // A group of sites sharing one consent passes its origin along.
            'https://app.termly.io/resource-blocker/' + uuid +
                '?autoBlock=on&masterConsentsOrigin=https://www.jobscan.co',
        ] ) {
            assert.ok(rules.some(r => matches(r, url)), 'no rule matches ' + url);
        }
        // Their embed renders a published policy or cookie list, which is
        // content rather than consent machinery.
        for ( const rule of rules ) {
            assert.equal(
                matches(rule, 'https://app.termly.io/embed.min.js'), false, rule
            );
        }
    });
});
