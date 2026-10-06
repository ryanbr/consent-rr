/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    The legacy Cookie Law Info plugin for WordPress.

    Four versions were read for this - 1.5.4, 1.6.3, 3.3.2 and 4.1.10, the
    last two byte-identical - and the one that matters most is the split
    between them: 3.x and 4.x prepend their banner markup themselves, 1.x does
    not prepend anything at all and has its markup printed into the page by
    PHP. A live 1.6.3 page carries #cookie-law-info-bar and
    #cookie-law-info-again, and their own cli-style.css gives the bar
    position:absolute and z-index:9999 with no display:none - so their script
    is what hides it, and a stub that only wrote the cookie would leave a dead
    cookie bar on screen. That is what these tests are mostly about.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

// Deep enough that the jar's own default path is not '/', so their
// explicit path=/ is visible rather than assumed.
const URL_PAGE = 'https://www.adamoads.com/es/noticias/page';
const SRC = 'https://www.adamoads.com/wp-content/plugins/cookie-law-info/' +
    'js/cookielawinfo.js?ver=1.6.3';

// Their own markup, as a 1.x page carries it: in the document already.
const BAR = '<div id="cookie-law-info-bar"><span>This website uses cookies.' +
    '<a href="#" id="cookie_action_close_header"' +
    ' class="cli-plugin-button">Accept</a></span></div>';
const AGAIN = '<div id="cookie-law-info-again">Privacy</div>';

const PAGE = '<!doctype html><html lang="en"><head>' +
    '<script src="' + SRC + '"></script>' +
    '</head><body>' + BAR + AGAIN + '<p id="content">x</p></body></html>';

// A 3.x page, where nothing of theirs is in the document.
const PAGE_3X = '<!doctype html><html lang="en"><head>' +
    '<script src="' + SRC.replace('1.6.3', '4.1.10') + '"></script>' +
    '</head><body><p id="content">x</p></body></html>';

// Their own settings, off a live page.
const SETTINGS = {
    animate_speed_hide: '500', animate_speed_show: '500',
    background: '#1f8c83', border: '#1f8c83', border_on: true,
    font_family: 'inherit', notify_animate_hide: true, notify_animate_show: true,
    notify_div_id: '#cookie-law-info-bar', notify_position_horizontal: 'right',
    notify_position_vertical: 'bottom', showagain_tab: false,
    showagain_div_id: '#cookie-law-info-again', text: '#ffffff',
    show_once_yn: false, show_once: '10000',
};

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('cookielawinfo-reject.js');
});

const boot = (options = {}) => runDom(
    reject, options.url || URL_PAGE, options.html || PAGE,
    w => {
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const win = (options = {}) => boot(options).window;

// How their own page calls in: inside a jQuery ready handler, with the
// markup and the settings as a JSON string.
const callIn = (w, overrides) => {
    w.cli_show_cookiebar({
        html: BAR,
        settings: JSON.stringify(Object.assign({}, SETTINGS, overrides || {})),
    });
};

const value = w => cookies(w).get('viewed_cookie_policy');
const present = (w, id) => w.document.getElementById(id) !== null;

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('cookielawinfo-reject', ( ) => {
    // Their own constants: ACCEPT_COOKIE_NAME, ACCEPT_COOKIE_EXPIRE and a
    // path of /, with 'no' from the decline their 1.x versions have.
    it('writes their decline in their own cookie', ( ) => {
        const dom = boot();
        assert.equal(value(dom.window), 'no');
        const [ cookie ] = cookiesInJar(dom, URL_PAGE, 'viewed_cookie_policy');
        assert.equal(cookie.path, '/');
        assert.equal(cookie.value, 'no');
        const days = (cookie.expires.getTime() - Date.now()) / 864e5;
        assert.ok(days > 363 && days < 366, 'their 365 days, got ' + days);
        // Theirs sets none of these, so neither does this: an absent
        // SameSite is undefined in the jar rather than "none".
        assert.equal(cookie.sameSite, undefined);
        assert.equal(cookie.secure, false);
        assert.equal(cookie.domain, 'www.adamoads.com', 'host-only, as theirs');
    });

    it('overwrites a stored acceptance', ( ) => {
        const w = win({
            before: ww => {
                ww.document.cookie = 'viewed_cookie_policy=yes; path=/';
            },
        });
        assert.equal(value(w), 'no');
        assert.equal(w.cookieLawInfoRR.state().overwrote, 'yes');
    });

    // Their banner shows on the absence of the cookie rather than its value:
    //   if (!Cookie.exists(ACCEPT_COOKIE_NAME)) { ... displayHeader() }
    it('leaves a record their own gate reads as answered', ( ) => {
        const w = win();
        assert.notEqual(value(w), undefined);
    });

    it('puts their two globals back', ( ) => {
        const w = win();
        assert.equal(typeof w.cli_show_cookiebar, 'function');
        assert.equal(typeof w.l1hs, 'function');
    });

    // Their l1hs, verbatim - it normalises a colour to a leading hash, and
    // their own file calls it with settings.text and settings.border.
    it('answers their l1hs the way theirs does', ( ) => {
        const w = win();
        assert.equal(w.l1hs('fff'), '#fff');
        assert.equal(w.l1hs('#fff'), '#fff');
        assert.equal(w.l1hs('##fff'), '#fff', 'theirs recurses');
        assert.equal(w.l1hs(''), '#');
    });

    it('inserts nothing where their 3.x and 4.x would prepend', ( ) => {
        const w = win({ html: PAGE_3X });
        callIn(w);
        assert.equal(present(w, 'cookie-law-info-bar'), false);
        assert.equal(w.document.body.querySelectorAll('div').length, 0);
    });
});

/******************************************************************************/

// The 1.x shape, which is the one a no-op gets wrong.
describe('cookielawinfo, their server-rendered bar', ( ) => {
    // The sweep on their call cannot be told apart from the pass-again in a
    // harness: the document is already built when the resource runs, so the
    // first pass has taken the bar before any call could. On a real page the
    // bar is below this script and arrives later, which is what the
    // pass-again is for - see the core.
    it('takes their bar and their show-again tab out', ( ) => {
        const w = win();
        callIn(w);
        assert.equal(present(w, 'cookie-law-info-bar'), false);
        assert.equal(present(w, 'cookie-law-info-again'), false);
        assert.equal(present(w, 'content'), true, 'and nothing else');
        assert.equal(w.cookieLawInfoRR.state().removed >= 2, true);
    });

    // Their settings name the ids, and a tenant can change them.
    it('takes the ids their own settings name', ( ) => {
        const html = '<!doctype html><html lang="en"><head>' +
            '<script src="' + SRC + '"></script></head><body>' +
            '<div id="my-bar">bar</div><div id="my-again">again</div>' +
            '<p id="content">x</p></body></html>';
        const w = win({ html });
        callIn(w, {
            notify_div_id: '#my-bar',
            showagain_div_id: '#my-again',
        });
        assert.equal(present(w, 'my-bar'), false);
        assert.equal(present(w, 'my-again'), false);
    });

    // Their call is inside a jQuery ready handler, so the markup is there by
    // then - but a page that prints their bar and never calls in still has to
    // be swept, and that is what the pass-again is for.
    it('sweeps their defaults where the page never calls in', async ( ) => {
        const w = win();
        await settle(200);
        assert.equal(present(w, 'cookie-law-info-bar'), false);
        assert.equal(present(w, 'cookie-law-info-again'), false);
    });

    it('sweeps a bar the parser delivers after it ran', async ( ) => {
        const w = win({ html: PAGE_3X });
        await settle(40);
        const late = w.document.createElement('div');
        late.id = 'cookie-law-info-bar';
        w.document.body.append(late);
        await settle(200);
        assert.equal(present(w, 'cookie-law-info-bar'), false);
    });

    it('survives being called with nothing of theirs', ( ) => {
        const w = win();
        for ( const given of [ undefined, null, {}, { settings: 'not json' },
            { settings: { notify_div_id: '#cookie-law-info-bar' } } ] ) {
            w.cli_show_cookiebar(given);
        }
        assert.equal(present(w, 'cookie-law-info-bar'), false);
        assert.equal(value(w), 'no');
    });

    it('asks for nothing', async ( ) => {
        const asked = [];
        const w = win({
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
        callIn(w);
        await settle(60);
        assert.deepEqual(asked, []);
    });
});

/******************************************************************************/

describe('cookielawinfo, the console line and the list', ( ) => {
    it('says what it did', ( ) => {
        let out;
        const w = win({ before: ww => { out = lines(ww); } });
        void w;
        const line = out.find(text => text.includes('cookielawinfo-reject'));
        assert.ok(line, out.join('\n'));
        assert.match(line, /cookie=viewed_cookie_policy=no stored=yes/);
        assert.match(line, /was=absent/);
        assert.match(line, /banner=none blocked=none sent=none/);
    });

    it('reports a stored acceptance it overwrote', ( ) => {
        let out;
        win({
            before: ww => {
                ww.document.cookie = 'viewed_cookie_policy=yes; path=/';
                out = lines(ww);
            },
        });
        assert.match(
            out.find(text => text.includes('cookielawinfo-reject')), /was=yes/
        );
    });

    it('is pinned at the version the package names', ( ) => {
        assert.equal(versions.cookielawinfo, '1.0.0');
    });

    // One rule by path: every copy is served by the site itself, so there is
    // no host to name.
    it('names their plugin path, not a host', ( ) => {
        assert.ok(filtersText.includes(
            '/plugins/cookie-law-info/js/cookielawinfo.js$script,redirect=cookielawinfo-reject.js'
        ));
    });

    it('leaves their stylesheet alone', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(/cli-style\.css/.test(line), false, line);
        }
    });

    it('says in the list why it cannot be blocked instead', ( ) => {
        assert.match(filtersText, /IT CANNOT BE BLOCKED INSTEAD/);
        assert.match(filtersText, /THEIR BANNER IS NOT ALWAYS THEIRS TO INSERT/);
        assert.match(filtersText, /NOT the hosted CookieYes script/);
    });
});
