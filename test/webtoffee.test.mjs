/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    WebToffee's GDPR Cookie Consent for WordPress - the version with
    categories, an api and real script blocking. The legacy single-file version
    is a separate family here.

    Their script ships unminified, so this family had the same oracle the
    CookieConsent one did: their own public/js/cookie-law-info-public.js 2.5.3
    was loaded into the same page as the resource, given the same Cli_Data and
    cli_cookiebar_settings, and their reject button pressed. For a fresh
    visitor all three of their records came out byte for byte identical to
    what this writes; the values pinned below are those bytes.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL_PAGE = 'https://www.cbu.edu/page';
const SRC = 'https://www.cbu.edu/wp-content/plugins/' +
    'webtoffee-gdpr-cookie-consent/public/js/cookie-law-info-public.js?ver=2.5.3';

// Their own markup, as a page carries it: printed by PHP, not built by the
// script.
const BAR = '<div id="cookie-law-info-bar" data-nosnippet="true">' +
    '<div class="cli-bar-container"><span>We use cookies.</span>' +
    '<a id="wt-cli-accept-all-btn" class="wt-cli-accept-all-btn">Accept All</a>' +
    '<a class="cookie_action_close_header_reject">Reject</a></div></div>' +
    '<div id="cookie-law-info-again"><span>Manage consent</span></div>' +
    '<div id="cliSettingsPopup" class="cli-modal">' +
    '<input type="checkbox" class="cli-user-preference-checkbox"' +
    ' data-id="checkbox-necessary" checked disabled>' +
    '<input type="checkbox" class="cli-user-preference-checkbox"' +
    ' data-id="checkbox-analytics">' +
    '<input type="checkbox" class="cli-user-preference-checkbox"' +
    ' data-id="checkbox-advertisement">' +
    '</div><div class="cli-modal-backdrop cli-fade"></div>';

const PARKED = '<script id="ga" data-cli-class="cli-blocker-script"' +
    ' type="text/plain" data-cli-script-type="analytics"' +
    ' data-cli-src="https://a.example/ga.js" data-keep="yes"></script>' +
    '<iframe id="yt" data-cli-class="cli-blocker-script"' +
    ' data-cli-src="https://www.youtube.com/embed/x"></iframe>';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="' + SRC + '"></script>' +
    '</head><body>' + BAR + PARKED + '<p id="content">x</p></body></html>';

// Their own Cli_Data, off a live page.
const CLI_DATA = {
    nn_cookie_ids: [
        'cookielawinfo-checkbox-analytics',
        'cookielawinfo-checkbox-advertisement',
    ],
    cookielist: [], non_necessary_cookies: {},
    ccpaEnabled: '', ccpaRegionBased: '', ccpaBarEnabled: '', ccpaType: 'gdpr',
    strictlyEnabled: [ 'necessary', 'obligatoire' ],
    ajax_url: 'https://www.cbu.edu/wp-admin/admin-ajax.php',
    current_lang: 'en', consentVersion: '1', cookieDomain: '',
    secure_cookies: '', triggerDomRefresh: '', geoIP: 'disabled',
    eu_countries: [], privacy_length: '250',
};

let reject;
let unblock;

before(async ( ) => {
    const resources = await loadResources();
    reject = resources.get('webtoffee-reject.js');
    unblock = resources.get('webtoffee-reject-unblock.js');
});

const boot = (which, options = {}) => runDom(
    which, options.url || URL_PAGE, options.html || PAGE,
    w => {
        w.__events = [];
        w.document.addEventListener('cli_consent_update', event => {
            w.__events.push(event.detail);
        });
        // Listening at the window too, so a dispatch at the wrong target
        // cannot pass unnoticed.
        w.__atWindow = [];
        w.addEventListener('cli_consent_update', ( ) => {
            w.__atWindow.push(1);
        });
        w.eval('window.Cli_Data = ' + JSON.stringify(
            Object.assign({}, CLI_DATA, options.data || {})
        ) + ';');
        if ( options.consts !== undefined ) { w.eval(options.consts); }
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const win = (which, options = {}) => boot(which, options).window;

const decode = w => {
    const raw = cookies(w).get('CookieLawInfoConsent');
    if ( raw === undefined ) { return null; }
    return JSON.parse(w.atob(raw));
};

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('webtoffee-reject', ( ) => {
    // The bytes their own reject button leaves behind for a fresh visitor.
    it('writes the three records their reject writes', ( ) => {
        const w = win(reject);
        const held = cookies(w);
        assert.equal(held.get('viewed_cookie_policy'), 'no');
        assert.equal(
            held.get('cli_user_preference'),
            'en-cli-no-checkbox-necessary-yes-checkbox-analytics-no' +
            '-checkbox-advertisement-no'
        );
        assert.deepEqual(decode(w), {
            ver: '1',
            necessary: 'true',
            analytics: 'false',
            advertisement: 'false',
        });
    });

    // Their reject erases the non-necessary category cookies rather than
    // setting them to no, and their load leaves the necessary one as yes.
    it('erases their non-necessary category cookies', ( ) => {
        const w = win(reject, {
            before: ww => {
                for ( const name of [
                    'cookielawinfo-checkbox-necessary',
                    'cookielawinfo-checkbox-analytics',
                    'cookielawinfo-checkbox-advertisement',
                ] ) {
                    ww.document.cookie = name + '=yes; path=/';
                }
            },
        });
        const held = cookies(w);
        assert.equal(held.get('cookielawinfo-checkbox-necessary'), 'yes');
        assert.equal(held.get('cookielawinfo-checkbox-analytics'), undefined);
        assert.equal(
            held.get('cookielawinfo-checkbox-advertisement'), undefined
        );
        assert.equal(w.webToffeeRR.state().erased, 2);
    });

    it('writes the necessary one where the page had none', ( ) => {
        const w = win(reject);
        assert.equal(
            cookies(w).get('cookielawinfo-checkbox-necessary'), 'yes'
        );
    });

    it('writes them with their own attributes', ( ) => {
        const dom = boot(reject);
        const [ cookie ] = cookiesInJar(dom, URL_PAGE, 'viewed_cookie_policy');
        assert.equal(cookie.path, '/');
        assert.equal(cookie.secure, false, 'their secure_cookies is off here');
        const days = (cookie.expires.getTime() - Date.now()) / 864e5;
        assert.ok(days > 363 && days < 366, 'their 365, got ' + days);
    });

    it('takes their secure and their domain from Cli_Data', ( ) => {
        const dom = boot(reject, {
            url: 'https://www.cbu.edu/page',
            data: { secure_cookies: true, cookieDomain: '.cbu.edu' },
        });
        const [ cookie ] = cookiesInJar(
            dom, 'https://www.cbu.edu/page', 'viewed_cookie_policy'
        );
        assert.equal(cookie.secure, true);
        assert.equal(cookie.domain, 'cbu.edu');
    });

    // Their four consts are the page's to set.
    it('honours the cookie names their page declares', ( ) => {
        const w = win(reject, {
            consts: 'window.CLI_ACCEPT_COOKIE_NAME = "my_policy";' +
                ' window.CLI_PREFERNCE_COOKIE = "MyConsent";' +
                ' window.CLI_ACCEPT_COOKIE_EXPIRE = 30;',
        });
        const held = cookies(w);
        assert.equal(held.get('my_policy'), 'no');
        assert.ok(held.get('MyConsent'));
        assert.equal(held.get('viewed_cookie_policy'), undefined);
    });

    it('takes their categories from the checkboxes', ( ) => {
        const w = win(reject);
        assert.deepEqual(
            Array.from(w.webToffeeRR.state().categories),
            [ 'necessary', 'analytics', 'advertisement' ]
        );
    });

    // Their own disableAllCookies unticks every box whose slug is not in
    // Cli_Data.strictlyEnabled, so that list - not the disabled attribute -
    // is which category is theirs to keep. A translated site names it in its
    // own language.
    it('reads their strictlyEnabled, not the disabled attribute', ( ) => {
        const html = PAGE
            .replace(
                '<input type="checkbox" class="cli-user-preference-checkbox"' +
                ' data-id="checkbox-necessary" checked disabled>',
                '<input type="checkbox" class="cli-user-preference-checkbox"' +
                ' data-id="checkbox-obligatoire" checked>'
            );
        const w = win(reject, { html });
        const held = cookies(w);
        assert.equal(held.get('cookielawinfo-checkbox-obligatoire'), 'yes');
        assert.equal(decode(w).obligatoire, 'true');
        assert.match(
            held.get('cli_user_preference'), /checkbox-obligatoire-yes/
        );
        assert.deepEqual(
            Array.from(w.CLI.allowedCategories), [ 'obligatoire' ]
        );
    });

    it('still refuses a category their list does not name', ( ) => {
        const html = PAGE.replace(
            ' data-id="checkbox-analytics">',
            ' data-id="checkbox-analytics" checked disabled>'
        );
        const w = win(reject, { html, data: { strictlyEnabled: [] } });
        assert.equal(decode(w).necessary, 'true', 'their own hardcoded name');
        assert.equal(
            decode(w).analytics, 'false',
            'a disabled box is their CSS, not their category list'
        );
        assert.equal(
            cookies(w).get('cookielawinfo-checkbox-analytics'), undefined
        );
    });

    // Where their banner is not in the page at all, their nn_cookie_ids is
    // the only list there is.
    it('falls back to their nn_cookie_ids', ( ) => {
        const html = '<!doctype html><html lang="en"><head>' +
            '<script src="' + SRC + '"></script>' +
            '</head><body><p id="content">x</p></body></html>';
        const w = win(reject, { html });
        assert.deepEqual(
            Array.from(w.webToffeeRR.state().categories),
            [ 'analytics', 'advertisement' ],
            'theirs records nothing at all without the checkboxes'
        );
        assert.equal(decode(w).analytics, 'false');
        assert.equal(decode(w).advertisement, 'false');
    });

    // Their generateConsent reads the record it finds and writes the
    // categories back over it, so a field of theirs this does not know about
    // survives and a stale acceptance does not.
    it('writes the refusal over a record it finds', ( ) => {
        const held = {
            ver: '1', necessary: 'true', analytics: 'true', wt_future: 'keep',
        };
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = 'CookieLawInfoConsent=' +
                    ww.btoa(JSON.stringify(held)) + '; path=/';
            },
        });
        const record = decode(w);
        assert.equal(record.analytics, 'false');
        assert.equal(record.advertisement, 'false');
        assert.equal(record.wt_future, 'keep', 'a field of theirs is kept');
    });

    // Their own reader takes either, because older copies of their plugin
    // wrote the record url-encoded.
    it('reads a record of theirs that is url-encoded', ( ) => {
        const w = win(reject, {
            before: ww => {
                ww.document.cookie = 'CookieLawInfoConsent=' +
                    ww.encodeURIComponent(JSON.stringify({
                        ver: '1', analytics: 'true', wt_future: 'keep',
                    })) + '; path=/';
            },
        });
        const record = decode(w);
        assert.equal(record.analytics, 'false');
        assert.equal(record.wt_future, 'keep');
    });

    it('takes their whole banner out', ( ) => {
        const w = win(reject);
        for ( const id of [
            'cookie-law-info-bar', 'cookie-law-info-again', 'cliSettingsPopup',
        ] ) {
            assert.equal(w.document.getElementById(id), null, id);
        }
        assert.equal(
            w.document.querySelectorAll('.cli-modal-backdrop').length, 0
        );
        assert.equal(w.document.getElementById('content') !== null, true);
    });

    // Their AfterConsent dispatches at the document, not the window.
    it('fires their consent event where theirs fires it', async ( ) => {
        const w = win(reject);
        await settle(40);
        assert.equal(w.__events.length, 1);
        assert.equal(w.__atWindow.length, 0, 'not at the window');
        const detail = w.__events[0];
        assert.equal(detail.status, 'reject');
        assert.deepEqual(Array.from(detail.categories.accepted), [ 'necessary' ]);
        assert.deepEqual(
            Array.from(detail.categories.rejected),
            [ 'analytics', 'advertisement' ]
        );
    });

    it('answers their api', ( ) => {
        const w = win(reject);
        for ( const name of [
            'accept_close', 'reject_close', 'enableAllCookies',
            'disableAllCookies', 'generateConsent',
            'generate_user_preference_cookie', 'saveLog', 'displayHeader',
            'hideHeader', 'settingsPopUp', 'settingsPopUpClose', 'l1hs',
            'set', 'AfterConsent',
        ] ) {
            assert.equal(typeof w.CLI[name], 'function', name);
        }
        for ( const name of [
            'set', 'read', 'erase', 'eraseCookie', 'exists', 'getallcookies',
        ] ) {
            assert.equal(typeof w.CLI_Cookie[name], 'function', name);
        }
        assert.deepEqual(Array.from(w.CLI.allowedCategories), [ 'necessary' ]);
    });

    it('cannot be argued up by their own buttons', ( ) => {
        const w = win(reject);
        w.CLI.accept_close();
        w.CLI.enableAllCookies();
        assert.equal(decode(w).analytics, 'false');
        assert.equal(cookies(w).get('viewed_cookie_policy'), 'no');
    });

    it('says how many it left parked', ( ) => {
        let out;
        const w = win(reject, { before: ww => { out = lines(ww); } });
        assert.equal(w.webToffeeRR.state().parked, 2);
        assert.equal(w.webToffeeRR.state().freed, 0);
        assert.ok(out.find(line => / parked=2 freed=0 /.test(line)));
    });

    it('leaves their parked scripts parked', async ( ) => {
        const w = win(reject);
        await settle(60);
        assert.equal(
            w.document.querySelectorAll(
                '[data-cli-class="cli-blocker-script"]'
            ).length, 2
        );
        assert.equal(w.document.getElementById('ga').type, 'text/plain');
        assert.equal(w.document.getElementById('yt').getAttribute('src'), null);
    });

    it('posts nothing to their logging endpoint', async ( ) => {
        const asked = [];
        const w = win(reject, {
            before: ww => {
                ww.fetch = url => { asked.push(String(url)); return Promise.reject(); };
                ww.XMLHttpRequest = class {
                    open(method, url) { asked.push(String(url)); }
                    send( ) {}
                    setRequestHeader( ) {}
                };
                ww.navigator.sendBeacon = url => { asked.push(String(url)); return true; };
            },
        });
        w.CLI.saveLog('reject');
        await settle(60);
        assert.deepEqual(asked, []);
    });

    // Their own reject reads the checkbox states to build those two records
    // and does not untick them first, so a visitor who had accepted gets
    // "true" recorded for a category it has just erased. This writes the
    // refusal in all three.
    it('writes the refusal even where their own would not', ( ) => {
        const html = PAGE.replace(
            ' data-id="checkbox-analytics">',
            ' data-id="checkbox-analytics" checked>'
        );
        const w = win(reject, { html });
        assert.equal(decode(w).analytics, 'false');
        assert.match(
            cookies(w).get('cli_user_preference'), /checkbox-analytics-no/
        );
    });
});

/******************************************************************************/

describe('webtoffee-reject-unblock', ( ) => {
    it('releases their parked script by their own contract', async ( ) => {
        const w = win(unblock);
        await settle(80);
        const freed = w.document.querySelector(
            'script[src="https://a.example/ga.js"]'
        );
        assert.ok(freed, 'the copy carries their data-cli-src');
        assert.equal(freed.type, 'analytics', 'their data-cli-script-type');
        assert.equal(freed.getAttribute('data-keep'), 'yes', 'and the rest');
        assert.equal(freed.getAttribute('data-cli-src'), null, 'markers go');
        assert.equal(freed.getAttribute('data-cli-class'), null);
    });

    it('puts their parked iframe back in place', async ( ) => {
        const w = win(unblock);
        await settle(80);
        const frame = w.document.getElementById('yt');
        assert.ok(frame, 'theirs is restored in place, not replaced');
        assert.equal(
            frame.getAttribute('src'), 'https://www.youtube.com/embed/x'
        );
        assert.equal(frame.getAttribute('data-cli-src'), null);
    });

    it('stores the same refusal', ( ) => {
        const w = win(unblock);
        assert.equal(cookies(w).get('viewed_cookie_policy'), 'no');
        assert.deepEqual(decode(w), {
            ver: '1',
            necessary: 'true',
            analytics: 'false',
            advertisement: 'false',
        });
    });

    it('and tells the page every category is allowed', async ( ) => {
        const w = win(unblock);
        await settle(40);
        assert.deepEqual(
            Array.from(w.CLI.allowedCategories).sort(),
            [ 'advertisement', 'analytics', 'necessary' ]
        );
        assert.deepEqual(
            Array.from(w.__events[0].categories.rejected), [],
            'their event says so too'
        );
    });

    // What stops this running away is that the copy carries none of their
    // data-cli-* markers, so the next pass does not match it: mutating the
    // marker strip hangs this test whether the WeakSet is there or not, and
    // the WeakSet alone does not save it, because the WeakSet holds the
    // original node and the copy is a new one.
    it('does not free its own work over and over', async ( ) => {
        const w = win(unblock);
        await settle(200);
        const settled = w.document.querySelectorAll('script').length;
        await settle(250);
        assert.equal(w.document.querySelectorAll('script').length, settled);
    });

    it('counts what it freed', async ( ) => {
        let out;
        const w = win(unblock, { before: ww => { out = lines(ww); } });
        await settle(80);
        assert.equal(w.webToffeeRR.state().parked, 2);
        assert.equal(w.webToffeeRR.state().freed, 2);
        assert.ok(
            out.find(line => / parked=2 freed=/.test(line)),
            out.join('\n')
        );
    });

    it('frees a tag the parser delivers after it ran', async ( ) => {
        const w = win(unblock);
        await settle(60);
        const late = w.document.createElement('script');
        late.id = 'late';
        late.setAttribute('data-cli-class', 'cli-blocker-script');
        late.type = 'text/plain';
        late.setAttribute('data-cli-src', 'https://l.example/l.js');
        w.document.body.append(late);
        await settle(250);
        assert.ok(
            w.document.querySelector('script[src="https://l.example/l.js"]')
        );
    });
});

/******************************************************************************/

describe('webtoffee, the console line and the lists', ( ) => {
    it('says what it did', ( ) => {
        let out;
        win(reject, { before: ww => { out = lines(ww); } });
        const line = out.find(text => text.includes('webtoffee-reject'));
        assert.ok(line, out.join('\n'));
        assert.match(line, /cookie=viewed_cookie_policy=no written=4/);
        assert.match(line, /erased=0 /);
        assert.match(line, /removed=4 parked=2 freed=0 told=1/);
        assert.match(line, /categories=necessary,analytics,advertisement/);
        assert.match(line, /surface=necessary/);
        assert.match(line, /banner=none logged=none/);
    });

    it('is pinned at the version the package names', ( ) => {
        assert.equal(versions.webtoffee, '1.0.0');
    });

    // One rule by path: the file name is the same under both plugin slugs,
    // and one of the live sites serves it out of /lib/ rather than
    // /wp-content/plugins/.
    it('names the file by path, not by host or slug', ( ) => {
        assert.ok(filtersText.includes(
            '/public/js/cookie-law-info-public.js$script,redirect=webtoffee-reject.js'
        ));
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            if ( line.includes('cookie-law-info-public.js') === false ) {
                continue;
            }
            assert.equal(/wp-content/.test(line), false, line);
        }
    });

    // Their cookie-audit table is page content, not consent UI.
    it('leaves all three of their stylesheets alone', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(/cookie-law-info-public\.css/.test(line), false, line);
            assert.equal(/cookie-law-info-gdpr\.css/.test(line), false, line);
            assert.equal(/cookie-law-info-table\.css/.test(line), false, line);
        }
        assert.match(filtersText, /THEIR STYLESHEETS ARE LEFT ALONE/);
        assert.match(filtersText, /the cookie-audit TABLE/);
    });

    it('leaves their admin-ajax endpoint alone', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(/admin-ajax/.test(line), false, line);
        }
    });

    it('says in the list what their reject does', ( ) => {
        assert.match(filtersText, /THEIR REFUSAL/);
        assert.match(filtersText, /ONE DELIBERATE DIFFERENCE/);
        assert.match(filtersText, /THEIR EVENT GOES TO THE DOCUMENT/);
    });

    it('the two built files differ by one line', ( ) => {
        const a = reject.split('\n');
        const b = unblock.split('\n');
        assert.equal(a.length, b.length);
        assert.deepEqual(
            a.filter((line, i) => line !== b[i]),
            [ "    consentRRWebToffee('reject');" ]
        );
    });
});
