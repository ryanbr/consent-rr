/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Complianz. A WordPress plugin, served first-party, whose every cookie name
    comes from a configuration object the page declares - so the fixtures here
    set that object, and one of them changes the prefix to prove nothing is
    hardcoded.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, filtersText, loadResources, runDom, settle, versions,
} from './helpers.mjs';

const URL = 'https://www.newdelhitimes.com/world/';
const SCRIPT = 'https://www.newdelhitimes.com/wp-content/plugins/' +
    'complianz-gdpr/cookiebanner/js/complianz.min.js';

// Their configuration, as WordPress prints it before their script, and the
// tags their blocker parks: the category on the element, the real url moved
// aside, and a notice over the hole.
const CONFIG = 'window.complianz = { prefix: "cmplz_", cookie_expiry: 365,' +
    ' current_policy_id: 17, consenttype: "optin", region: "eu",' +
    ' cookie_domain: "", cookie_path: "/", clean_cookies: 0,' +
    ' tm_categories: 0 };';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="' + SCRIPT + '"></script>' +
    '</head><body>' +
    '<script id="stat" type="text/plain" data-category="statistics"' +
    ' data-service="google-analytics" data-script-type="text/javascript"' +
    ' data-src="https://s.example/s.js"></script>' +
    '<script id="mkt" type="text/plain" data-category="marketing"' +
    ' data-service="facebook" data-src="https://m.example/m.js"></script>' +
    '<script id="fun" type="text/plain" data-category="functional"' +
    ' data-src="https://f.example/f.js"></script>' +
    '<iframe id="embed" data-category="marketing" data-service="youtube"' +
    ' data-src-cmplz="https://www.youtube.com/embed/x"></iframe>' +
    '<div class="cmplz-blocked-content-notice">click to accept</div>' +
    '<p id="content">x</p></body></html>';

let reject;
let accept;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('complianz-reject.js');
    accept = resources.get('complianz-accept.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL, options.html || PAGE,
    w => {
        w.eval(options.config === undefined ? CONFIG : options.config);
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
).window;

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('complianz-reject', ( ) => {
    it('writes deny for every category but functional', ( ) => {
        const jar = cookies(boot(reject));
        assert.equal(jar.get('cmplz_functional'), 'allow');
        assert.equal(jar.get('cmplz_preferences'), 'deny');
        assert.equal(jar.get('cmplz_statistics'), 'deny');
        assert.equal(jar.get('cmplz_marketing'), 'deny');
    });

    it('writes deny rather than leaving the record absent', ( ) => {
        // Their cmplz_has_consent reads an EMPTY cookie as consent where
        // consenttype is optout or other. Writing nothing would consent on
        // exactly the sites that assume consent.
        const w = boot(reject, {
            config: CONFIG.replace('"optin"', '"optout"'),
        });
        assert.equal(cookies(w).get('cmplz_marketing'), 'deny');
        assert.equal(w.cmplz_has_consent('marketing'), false);
    });

    it('keeps their policy id, so the record is not wiped', ( ) => {
        // Their cmplz_check_cookie_policy_id denies everything, clears every
        // cmplz cookie and re-shows the banner when the stored id does not
        // match complianz.current_policy_id.
        assert.equal(cookies(boot(reject)).get('cmplz_policy_id'), '17');
    });

    it('follows the prefix the page configured', ( ) => {
        const w = boot(reject, {
            config: CONFIG.replace('"cmplz_"', '"wp_consent_"'),
        });
        const jar = cookies(w);
        assert.equal(jar.get('wp_consent_marketing'), 'deny');
        assert.equal(jar.get('cmplz_marketing'), undefined,
            'nothing is written under a name this invented');
    });

    it('dismisses the banner and records what was saved', ( ) => {
        const jar = cookies(boot(reject));
        assert.equal(jar.get('cmplz_banner-status'), 'dismissed');
        assert.deepEqual(
            JSON.parse(decodeURIComponent(jar.get('cmplz_saved_categories'))),
            [ 'functional' ]
        );
    });

    it('records their services as denied, by the names on the page', ( ) => {
        const jar = cookies(boot(reject));
        const map = JSON.parse(decodeURIComponent(jar.get('cmplz_consented_services')));
        assert.equal(map['google-analytics'], false);
        assert.equal(map.facebook, false);
        assert.equal(map.youtube, false);
    });

    it('leaves every parked tag parked', ( ) => {
        const w = boot(reject);
        const doc = w.document;
        assert.equal(doc.getElementById('stat').type, 'text/plain');
        assert.equal(doc.getElementById('mkt').type, 'text/plain');
        assert.equal(doc.getElementById('embed').getAttribute('src'), null);
        assert.equal(
            doc.querySelectorAll('script[src="https://s.example/s.js"]').length, 0
        );
    });

    it('dispatches their status change once per category', ( ) => {
        const seen = [];
        boot(reject, {
            before: w_ => {
                w_.document.addEventListener('cmplz_status_change', event => {
                    seen.push(event.detail.category + '=' + event.detail.value);
                });
            },
        });
        assert.deepEqual(seen, [
            'functional=allow', 'preferences=deny',
            'statistics=deny', 'marketing=deny',
        ]);
    });

    it('dispatches at the document, where theirs does', ( ) => {
        // A window listener hears a bubbling document event too, so it cannot
        // tell the two apart - this one listens where their own pages do.
        let atDocument = 0;
        boot(reject, {
            before: w_ => {
                w_.document.addEventListener(
                    'cmplz_cookie_warning_loaded', ( ) => { atDocument += 1; }
                );
            },
        });
        assert.equal(atDocument, 1);
    });

    it('fires the load events a plugin waits on', ( ) => {
        const seen = [];
        boot(reject, {
            before: w_ => {
                for ( const name of [
                    'cmplz_cookie_warning_loaded', 'cmplz_fire_categories',
                    'cmplz_run_after_all_scripts',
                ] ) {
                    w_.document.addEventListener(name, ( ) => seen.push(name));
                }
            },
        });
        assert.deepEqual(seen, [
            'cmplz_cookie_warning_loaded',
            'cmplz_fire_categories',
            'cmplz_run_after_all_scripts',
        ]);
    });

    it('answers their public surface', ( ) => {
        const w = boot(reject);
        assert.equal(w.cmplz_has_consent('functional'), true);
        assert.equal(w.cmplz_has_consent('marketing'), false);
        assert.equal(w.cmplz_get_banner_status(), 'dismissed');
        assert.equal(w.cmplz_highest_accepted_category(), '');
        assert.equal(w.cmplz_is_service_denied('facebook'), true);
        assert.equal(w.cmplz_has_service_consent('facebook', 'marketing'), false);
        assert.equal(w.cmplz_deny_all(), true);
        assert.equal(w.cmplz_accept_all(), false);
        assert.equal(w.cmplz_get_cookie('marketing'), 'deny');
        assert.deepEqual(Array.from(w.cmplz_categories), [
            'functional', 'preferences', 'statistics', 'marketing',
        ]);
    });

    it('refuses a page that asks it to allow a category', ( ) => {
        const w = boot(reject);
        assert.equal(w.cmplz_set_consent('marketing', 'allow'), false);
        assert.equal(cookies(w).get('cmplz_marketing'), 'deny');
    });

    it('tells the WordPress consent API where the site has one', ( ) => {
        const seen = [];
        boot(reject, {
            before: w_ => {
                w_.wp_set_consent = (category, value) => {
                    seen.push(category + '=' + value);
                };
            },
        });
        assert.ok(seen.includes('marketing=deny'), seen.join(' '));
        assert.ok(seen.includes('functional=allow'), seen.join(' '));
    });

    it('stands aside where their own script already ran', ( ) => {
        const w = boot(reject, {
            before: w_ => {
                w_.cmplz_set_consent = ( ) => 'theirs';
            },
        });
        assert.equal(w.cmplz_set_consent(), 'theirs');
        assert.equal(cookies(w).get('cmplz_banner-status'), undefined);
    });

    it('says what it did, and what it read', ( ) => {
        let out;
        boot(reject, { before: w_ => { out = lines(w_); } });
        assert.equal(out.length, 1);
        assert.ok(out[0].includes('complianz-reject ' + versions.complianz), out[0]);
        assert.ok(out[0].includes('categories=functional'), out[0]);
        assert.ok(out[0].includes('prefix=cmplz_'), out[0]);
        assert.ok(out[0].includes('policy=kept'), out[0]);
        assert.ok(out[0].includes('consenttype=optin'), out[0]);
    });
});

/******************************************************************************/

describe('complianz-accept', ( ) => {
    it('allows every category', ( ) => {
        const jar = cookies(boot(accept));
        for ( const name of [ 'functional', 'preferences', 'statistics', 'marketing' ] ) {
            assert.equal(jar.get('cmplz_' + name), 'allow', name);
        }
        assert.deepEqual(
            JSON.parse(decodeURIComponent(jar.get('cmplz_saved_categories'))),
            [ 'functional', 'preferences', 'statistics', 'marketing' ]
        );
    });

    it('releases a parked script the way theirs does', ( ) => {
        const w = boot(accept);
        const copies = w.document.querySelectorAll(
            'script[src="https://s.example/s.js"]'
        );
        assert.equal(copies.length, 1, 'a copy runs; the parked one cannot');
        assert.equal(copies[0].type, 'text/javascript');
        assert.ok(copies[0].classList.contains('cmplz-activated'));
    });

    it('releases a parked frame from their own attribute', ( ) => {
        const w = boot(accept);
        assert.equal(
            w.document.getElementById('embed').getAttribute('src'),
            'https://www.youtube.com/embed/x'
        );
    });

    it('leaves a functional tag alone, as theirs does', ( ) => {
        // Their cmplz_enable_category skips data-category="functional": it was
        // never parked for consent.
        const w = boot(accept);
        assert.equal(
            w.document.querySelectorAll('script[src="https://f.example/f.js"]').length,
            0
        );
    });

    it('takes their click-to-accept notice away', ( ) => {
        const w = boot(accept);
        assert.equal(
            w.document.querySelector('.cmplz-blocked-content-notice'), null
        );
    });

    it('records their services as consented', ( ) => {
        const jar = cookies(boot(accept));
        const map = JSON.parse(decodeURIComponent(jar.get('cmplz_consented_services')));
        assert.equal(map.facebook, true);
        assert.equal(map.youtube, true);
    });

    it('answers their surface the other way', ( ) => {
        const w = boot(accept);
        assert.equal(w.cmplz_has_consent('marketing'), true);
        assert.equal(w.cmplz_highest_accepted_category(), 'marketing');
        assert.equal(w.cmplz_is_service_denied('facebook'), false);
        assert.equal(w.cmplz_accept_all(), true);
        assert.equal(w.cmplz_deny_all(), false);
    });

    it('says what it did', ( ) => {
        let out;
        boot(accept, { before: w_ => { out = lines(w_); } });
        assert.ok(out[0].includes('categories=all'), out[0]);
        assert.ok(/revived=[1-9]/.test(out[0]), out[0]);
    });
});

/******************************************************************************/

describe('filters, complianz', ( ) => {
    it('matches the file under any plugins path, not a host', ( ) => {
        assert.match(
            filtersText,
            /\/wp-content\/plugins\/\*\/complianz\.min\.js\$script,redirect=complianz-reject\.js/
        );
    });

    it('says in the list that nothing in the record is hardcoded', ( ) => {
        assert.match(filtersText, /NOTHING IN THEIR RECORD CAN BE HARDCODED/);
        assert.match(filtersText, /AN EMPTY COOKIE CAN MEAN YES/);
    });
});
