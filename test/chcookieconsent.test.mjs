/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    ConnectHolland's CookieConsentBundle for Symfony, where the consent is
    written by their server rather than by their script.

    That removes the usual oracle - their file stores nothing to compare with
    - and puts a better one in its place: their click handler POSTs the form,
    and the body it posts is exactly what their server turns into cookies. So
    their real cookie_consent.js was loaded onto the live banner markup with
    XMLHttpRequest stubbed, their refusal button clicked, and the body read
    off the wire:

      cookie_consent[analytics]=false&cookie_consent[tracking]=false
      &cookie_consent[marketing]=false&cookie_consent[_token]=...
      &cookie_consent[use_only_functional_cookies]=

    The cookies pinned below are what their CookieHandler writes from that.

*/

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';
import { CookieJar, JSDOM, VirtualConsole } from 'jsdom';
import {
    cookies, cookiesInJar, filtersText, loadResources, runDom, settle,
    versions,
} from './helpers.mjs';

const URL_PAGE = 'https://www.trapicheos.net/page';
const SRC = 'https://www.trapicheos.net/bundles/chcookieconsent/js/cookie_consent.js';

// Their own markup, from the live page: the script tag their template emits
// sits inside the banner, one line above it.
const category = (slug, allowed) =>
    '<div class="ch-cookie-consent__category">' +
    '<div class="ch-cookie-consent__category-toggle">' +
    '<input type="radio" id="cookie_consent_' + slug + '_0"' +
    ' name="cookie_consent[' + slug + ']" required="required" value="true"' +
    (allowed ? ' checked="checked"' : '') + ' />' +
    '<input type="radio" id="cookie_consent_' + slug + '_1"' +
    ' name="cookie_consent[' + slug + ']" required="required" value="false"' +
    (allowed ? '' : ' checked="checked"') + ' />' +
    '</div></div>';

const banner = (slugs = [ 'analytics', 'tracking', 'marketing' ]) =>
    '<div class="trapicheos-cookies-manager">' +
    '<div class="ch-cookie-consent ch-cookie-consent--light-theme' +
    ' ch-cookie-consent--top ch-cookie-consent--simplified">' +
    '<h3 class="ch-cookie-consent__title">Cookies</h3>' +
    '<form name="cookie_consent" method="post" action="/cookies/save"' +
    ' class="ch-cookie-consent__form">' +
    '<div class="ch-cookie-consent__category-group">' +
    slugs.map(slug => category(slug, false)).join('') +
    '</div><div class="ch-cookie-consent__btn-group">' +
    '<button type="button" id="cookie_consent_use_only_functional_cookies"' +
    ' name="cookie_consent[use_only_functional_cookies]"' +
    ' class="btn ch-cookie-consent__btn">Configurar cookies</button>' +
    '<button type="button" id="cookie_consent_use_all_cookies"' +
    ' name="cookie_consent[use_all_cookies]"' +
    ' class="btn ch-cookie-consent__btn ch-cookie-consent__btn--secondary">' +
    'Aceptar cookies</button>' +
    '<input type="hidden" id="cookie_consent__token"' +
    ' name="cookie_consent[_token]" value="e3b09130cb4d7e3f.uXQkDI80txHz" />' +
    '</div></form></div></div>';

// Their simplified option defaults to FALSE, so this - one save button, no
// accept-all - is the shape most of their deployments render. Measured on
// zoo-frankfurt.de, which carries five categories of its own naming and a
// save button beside the other two.
const saveOnly = (slugs = [ 'matomo', 'youtube', 'open_street_map' ]) =>
    '<div class="ch-cookie-consent ch-cookie-consent--light-theme' +
    ' ch-cookie-consent--bottom ">' +
    '<form name="cookie_consent" method="post"' +
    ' action="/cookie-consent-form-action" class="ch-cookie-consent__form">' +
    '<div class="ch-cookie-consent__category-group">' +
    slugs.map(slug => category(slug, false)).join('') +
    '</div><div class="ch-cookie-consent__btn-group">' +
    '<button type="button" id="cookie_consent_save"' +
    ' name="cookie_consent[save]" class="btn ch-cookie-consent__btn">' +
    'Speichern</button>' +
    '<input type="hidden" name="cookie_consent[_token]" value="abc.def" />' +
    '</div></form></div>';

const PAGE = '<!doctype html><html lang="es"><head>' +
    '<script src="' + SRC + '"></script>' +
    '</head><body><p id="content">page</p>' + banner() + '</body></html>';

const CATEGORY = 'Cookie_Category_';

let reject;

before(async ( ) => {
    reject = (await loadResources()).get('chcookieconsent-reject.js');
});

const boot = (options = {}) => runDom(
    reject, options.url || URL_PAGE,
    options.html !== undefined ? options.html : PAGE,
    w => {
        w.__events = [];
        w.__atWindow = [];
        w.document.addEventListener(
            'cookie-consent-form-submit-successful',
            event => { w.__events.push(event); }
        );
        w.addEventListener(
            'cookie-consent-form-submit-successful',
            ( ) => { w.__atWindow.push(1); }
        );
        if ( typeof options.before === 'function' ) { options.before(w); }
    }
);

const win = (options = {}) => boot(options).window;

const lines = w => {
    const out = [];
    w.console.info = line => { out.push(String(line)); };
    return out;
};

/******************************************************************************/

describe('chcookieconsent-reject', ( ) => {
    // What their server writes from their own refusal POST.
    it('writes the record their server writes', ( ) => {
        const held = cookies(win());
        const stamp = held.get('Cookie_Consent');
        assert.match(
            stamp,
            /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), \d\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d\d:\d\d:\d\d \+0000$/,
            'their date("r"), in UTC as their server\u0027s is'
        );
        // Their own, off the live site: 31 characters, so the same shape.
        assert.equal(stamp.length, 'Tue, 06 Oct 2026 08:00:20 +0000'.length);
        assert.match(held.get('Cookie_Consent_Key'), /^[0-9a-f]{13}$/,
            'their uniqid()');
        assert.equal(held.get(CATEGORY + 'analytics'), 'false');
        assert.equal(held.get(CATEGORY + 'tracking'), 'false');
        assert.equal(held.get(CATEGORY + 'marketing'), 'false');
    });

    // Their gate is an exact compare with the string true, so false and
    // absent both refuse - but their own refusal writes false, and their
    // form is rendered from these cookies next time.
    it('refuses in their own value, not by leaving it out', ( ) => {
        const w = win();
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused),
            [ 'analytics', 'tracking', 'marketing' ]
        );
        assert.equal(w.chCookieConsentRR.state().written, 5);
        assert.equal(w.chCookieConsentRR.state().blocked, 0);
    });

    // Measured against what their server sets on the live https page: path /,
    // host-only, SameSite=Lax, and no Secure flag.
    it('writes them with their own attributes', ( ) => {
        const url = 'https://www.trapicheos.net/deep/page';
        const dom = boot({ url: url });
        for ( const name of [ 'Cookie_Consent', CATEGORY + 'tracking' ] ) {
            const [ cookie ] = cookiesInJar(dom, url, name);
            assert.ok(cookie, name);
            assert.equal(cookie.path, '/', name);
            assert.equal(cookie.sameSite, 'lax', name);
            assert.equal(cookie.domain, 'www.trapicheos.net', name);
            assert.equal(cookie.hostOnly, true, name);
            const days = (cookie.expires.getTime() - Date.now()) / 864e5;
            assert.ok(days > 360 && days < 370, name + ' a year: ' + days);
        }
    });

    // Theirs is their server's clock in UTC. A stamp built from the
    // visitor's own clock and then labelled +0000 is a wrong timestamp, and
    // in any zone but UTC it is wrong by hours - so the zone is moved out
    // from under it here, because a runner in UTC cannot tell the difference.
    it('stamps it in UTC, not in the visitor\u0027s zone', ( ) => {
        const held = process.env.TZ;
        try {
            // A zone whose calendar date is not UTC's right now, so every
            // part of the stamp is pinned and not just its offset: one of
            // these two always is, whatever the hour in UTC.
            for ( const zone of [ 'Pacific/Midway', 'Pacific/Kiritimati' ] ) {
                process.env.TZ = zone;
                if ( new Date().getDate() !== new Date().getUTCDate() ) {
                    break;
                }
            }
            assert.notEqual(
                new Date().getDate(), new Date().getUTCDate(),
                'the zone moved the date'
            );
            const stamp = cookies(win()).get('Cookie_Consent');
            const expected = [ 0, 1, 2 ].map(back => new Date(Date.now() - back * 1000)
                .toUTCString().replace('GMT', '+0000'));
            assert.ok(
                expected.indexOf(stamp) !== -1,
                stamp + ' is not one of ' + expected.join(' / ')
            );
        } finally {
            if ( held === undefined ) {
                delete process.env.TZ;
            } else {
                process.env.TZ = held;
            }
        }
    });

    // Their own carry no Secure flag even on an https page - their Symfony
    // Cookie takes a null secure flag, which resolves to the request as the
    // app sees it, and theirs is behind a proxy. A cookie without it is sent
    // on both schemes, which is what their server reading a refusal wants.
    it('leaves Secure off, as their own server does', ( ) => {
        for ( const url of [
            'https://www.trapicheos.net/page', 'http://www.trapicheos.net/page',
        ] ) {
            const dom = boot({ url: url });
            const [ cookie ] = cookiesInJar(dom, url, 'Cookie_Consent');
            assert.equal(cookie.secure, false, url);
        }
    });

    // Their getCookieConsentKey: the key the visitor already has, else a new
    // one.
    it('keeps the key their server gave this visitor', ( ) => {
        const w = win({
            before: ww => {
                ww.document.cookie = 'Cookie_Consent_Key=68e1f0a1b2c3d; path=/';
            },
        });
        assert.equal(cookies(w).get('Cookie_Consent_Key'), '68e1f0a1b2c3d');
        assert.equal(w.chCookieConsentRR.state().key, '68e1f0a1b2c3d');
    });

    /**************************************************************************/

    // Their category list is a config list, so the form is the authority.
    it('takes their categories off their form', ( ) => {
        const w = win({
            html: PAGE.replace(
                banner(),
                banner([ 'analytics', 'social_media', 'partner_profiling' ])
            ),
        });
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused),
            [ 'analytics', 'social_media', 'partner_profiling' ],
            'including a name no enum of theirs has'
        );
        assert.equal(cookies(w).get(CATEGORY + 'partner_profiling'), 'false');
    });

    it('does not mistake their buttons or their token for a category', ( ) => {
        const held = cookies(win());
        for ( const name of [
            'use_all_cookies', 'use_only_functional_cookies', 'save', '_token',
        ] ) {
            assert.equal(held.get(CATEGORY + name), undefined, name);
        }
    });

    // The four their enum names, for a page that turns out to carry no form -
    // and not before the document is done, because until then a form is
    // still possible.
    it('falls back to their four names with no form in the page', async ( ) => {
        const w = win({
            html: '<!doctype html><html lang="es"><head>' +
                '<script src="' + SRC + '"></script></head>' +
                '<body><p id="content">page</p></body></html>',
        });
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused), [],
            'nothing while their form could still be parsed'
        );
        await settle(80);
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused),
            [ 'analytics', 'tracking', 'marketing', 'social_media' ]
        );
    });

    // Their banner is one line below their script tag, so a fallback at that
    // point would write a category the site does not have - and the pass runs
    // again after the banner has been taken out, where the form is gone.
    it('never widens past the form once it has read one', async ( ) => {
        const w = win();
        await settle(300);
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused),
            [ 'analytics', 'tracking', 'marketing' ]
        );
        assert.equal(cookies(w).get(CATEGORY + 'social_media'), undefined);
    });

    /**************************************************************************/

    it('takes their banner out and leaves the page', ( ) => {
        const w = win();
        assert.equal(w.document.querySelector('.ch-cookie-consent'), null);
        assert.ok(w.document.getElementById('content'));
        assert.ok(
            w.document.querySelector('.trapicheos-cookies-manager'),
            'their wrapper is the site\u0027s own markup, not theirs'
        );
        assert.equal(w.chCookieConsentRR.state().removed, 1);
    });

    // Their own positioning sets one of these to the banner's height and
    // their own submit clears both, so this clears both - which only shows
    // on a page where something has set one, their own script being gone.
    it('clears the margins their positioning sets', ( ) => {
        const w = win({
            before: ww => {
                ww.document.body.style.marginTop = '180px';
                ww.document.body.style.marginBottom = '40px';
            },
        });
        assert.equal(w.document.body.style.marginTop, '');
        assert.equal(w.document.body.style.marginBottom, '');
    });

    /**************************************************************************/

    // Their own event, at their own target, carrying the button theirs would
    // have carried for this answer.
    it('fires their event where theirs fires it', ( ) => {
        const w = win();
        assert.equal(w.__events.length, 1);
        assert.equal(w.__atWindow.length, 0, 'not at the window');
        const event = w.__events[0];
        assert.equal(event.type, 'cookie-consent-form-submit-successful');
        assert.equal(event.target, w.document);
        assert.equal(
            event.detail.getAttribute('name'),
            'cookie_consent[use_only_functional_cookies]',
            'their refusal button, as a click on it would have'
        );
    });

    it('hands the listener a button that is still in the document', ( ) => {
        const w = win();
        const button = w.__events[0].detail;
        assert.ok(button.closest('form'), 'theirs fires before the banner goes');
    });

    it('fires it once, not once a pass', async ( ) => {
        const w = win();
        await settle(300);
        assert.equal(w.__events.length, 1);
        assert.equal(w.chCookieConsentRR.state().told, 1);
    });

    // Their default shape, and the one this had no fixture for: no
    // accept-all button, a save that posts whatever the radios say, and
    // category names that are the site's own.
    it('answers their default shape, with only a save button', ( ) => {
        const w = win({
            html: '<!doctype html><html lang="de"><head>' +
                '<script src="' + SRC + '"></script></head><body>' +
                '<p id="content">page</p>' + saveOnly() + '</body></html>',
        });
        const held = cookies(w);
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused),
            [ 'matomo', 'youtube', 'open_street_map' ]
        );
        assert.equal(held.get(CATEGORY + 'matomo'), 'false');
        assert.equal(held.get(CATEGORY + 'save'), undefined);
        assert.ok(held.get('Cookie_Consent'));
        assert.equal(w.document.querySelector('.ch-cookie-consent'), null);
        assert.equal(
            w.__events[0].detail.getAttribute('name'),
            'cookie_consent[save]',
            'the only button there is to carry'
        );
    });

    // A form of theirs can have no action at all - measured on
    // commune-cransmontana.ch, where their own script falls back to
    // location.href. Nothing is posted here either way.
    it('answers a form of theirs with no action', ( ) => {
        const w = win({
            html: '<!doctype html><html lang="fr"><head>' +
                '<script src="' + SRC + '"></script></head><body>' +
                saveOnly([ 'analytics' ])
                    .replace(' action="/cookie-consent-form-action"', '') +
                '</body></html>',
        });
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused), [ 'analytics' ]
        );
        assert.equal(cookies(w).get(CATEGORY + 'analytics'), 'false');
    });

    /**************************************************************************/

    it('posts nothing to their form action', async ( ) => {
        const asked = [];
        const w = win({
            before: ww => {
                ww.fetch = url => {
                    asked.push(String(url));
                    return Promise.reject();
                };
                ww.XMLHttpRequest = class {
                    open(method, url) { asked.push(String(url)); }
                    send( ) {}
                    setRequestHeader( ) {}
                };
                ww.navigator.sendBeacon = url => {
                    asked.push(String(url));
                    return true;
                };
            },
        });
        await settle(300);
        assert.deepEqual(asked, []);
        assert.ok(w.chCookieConsentRR, 'and it still ran');
    });

    // Their other global, a top-level function declaration in their file.
    // The string pinned here is the body their own script posted on the live
    // markup, read off a stubbed XMLHttpRequest.
    it('answers their serializeForm with what theirs posts', ( ) => {
        const w = win({ html: PAGE });
        assert.equal(typeof w.serializeForm, 'function');
        const dom2 = boot();
        const form = dom2.window.document.createElement('div');
        form.innerHTML = banner();
        const inner = form.querySelector('form');
        const button = inner.querySelector(
            '[name="cookie_consent[use_only_functional_cookies]"]'
        );
        assert.equal(
            decodeURIComponent(w.serializeForm(inner, button)),
            'cookie_consent[analytics]=false' +
            '&cookie_consent[tracking]=false' +
            '&cookie_consent[marketing]=false' +
            '&cookie_consent[_token]=e3b09130cb4d7e3f.uXQkDI80txHz' +
            '&cookie_consent[use_only_functional_cookies]='
        );
    });
});

/******************************************************************************/

// Their http_only option defaults to true, and a page is not allowed to
// replace an HttpOnly cookie. So a visitor who accepted before this was
// installed cannot be walked back from here - and the resource says so
// rather than reporting a refusal it did not manage to store.
describe('chcookieconsent-reject, against their HttpOnly default', ( ) => {
    const withJar = async (given, options = {}) => {
        const jar = new CookieJar();
        const url = 'https://www.trapicheos.net/';
        for ( const line of given ) { jar.setCookieSync(line, url); }
        const virtualConsole = new VirtualConsole();
        const lines = [];
        virtualConsole.on('info', message => { lines.push(String(message)); });
        const markup = options.wrapper !== undefined
            ? '<div class="cookie-consent-div" style="' + options.wrapper +
                '">' + banner() + '</div>'
            : banner();
        const dom = new JSDOM(
            '<!doctype html><html lang="es"><head></head><body' +
            (options.margin !== undefined
                ? ' style="margin-bottom: ' + options.margin + '"'
                : '') +
            '><script>' + reject + '</script>' + markup + '</body></html>',
            { url, runScripts: 'dangerously', virtualConsole, cookieJar: jar }
        );
        await settle(60);
        return { w: dom.window, jar, url, lines };
    };

    it('reports the writes their own flag blocks', async ( ) => {
        const { w, jar, url } = await withJar([
            'Cookie_Consent=Mon, 05 Oct 2026 10:00:00 +0200; Path=/; HttpOnly',
            'Cookie_Consent_Key=68e1f0a1b2c3d; Path=/; HttpOnly',
            'Cookie_Category_analytics=true; Path=/; HttpOnly',
            'Cookie_Category_tracking=true; Path=/; HttpOnly',
            'Cookie_Category_marketing=true; Path=/; HttpOnly',
        ]);
        const state = w.chCookieConsentRR.state();
        assert.equal(state.written, 0, 'not one of them took');
        assert.equal(state.blocked, 5);
        const stored = jar.getCookiesSync(url, { http: true });
        assert.equal(
            stored.find(c => c.key === 'Cookie_Category_analytics').value,
            'true',
            'theirs stands, and nothing in a page can change that'
        );
        // And their form stays. With the record unreplaceable, their own
        // banner is the only place the visitor can change the answer, so
        // taking it out would stand them with the answer they have.
        assert.ok(
            w.document.querySelector('.ch-cookie-consent'),
            'their form is the only route left, so it stays'
        );
        assert.equal(state.removed, 0);
        assert.equal(state.left, 1);
        assert.equal(state.told, 0, 'and no event, because nothing was stored');
    });

    // The other half of leaving their banner: the space the page has
    // reserved for it stays reserved. Their own submit clears those margins
    // because their own banner has gone with it.
    it('keeps the space the page reserved for a banner it leaves', async ( ) => {
        const { w } = await withJar([
            'Cookie_Consent=old; Path=/; HttpOnly',
            'Cookie_Consent_Key=68e1f0a1b2c3d; Path=/; HttpOnly',
            'Cookie_Category_analytics=true; Path=/; HttpOnly',
            'Cookie_Category_tracking=true; Path=/; HttpOnly',
            'Cookie_Category_marketing=true; Path=/; HttpOnly',
        ], { margin: '180px' });
        assert.ok(w.document.querySelector('.ch-cookie-consent'));
        assert.equal(w.document.body.style.marginBottom, '180px');
    });

    // Measured on zoo-frankfurt.de: once a record exists they serve the
    // banner again inside the site's own hidden wrapper, as a settings panel
    // to re-open. Nobody can see it, and it is the only way to change an
    // answer.
    it('leaves a banner the page is keeping out of sight', async ( ) => {
        const { w } = await withJar([ 'Cookie_Category_matomo=true; Path=/' ], {
            wrapper: 'position: fixed; display: none;',
        });
        assert.ok(w.document.querySelector('.ch-cookie-consent'));
        assert.equal(w.chCookieConsentRR.state().left, 1);
        assert.equal(w.chCookieConsentRR.state().removed, 0);
        // The refusal is still stored - this flag is theirs to set and that
        // site does not set it.
        assert.equal(
            w.chCookieConsentRR.state().written, 5,
            'their consent, their key and the form\u0027s three categories'
        );
        assert.equal(w.chCookieConsentRR.state().told, 1, 'and it is announced');
    });

    it('stores the refusal where they turned their flag off', async ( ) => {
        const { w, jar, url } = await withJar([
            'Cookie_Category_analytics=true; Path=/',
            'Cookie_Category_tracking=true; Path=/',
        ]);
        assert.equal(w.chCookieConsentRR.state().blocked, 0);
        const stored = jar.getCookiesSync(url, { http: true });
        assert.equal(
            stored.find(c => c.key === 'Cookie_Category_analytics').value,
            'false'
        );
    });
});

/******************************************************************************/

describe('chcookieconsent, at document_start', ( ) => {
    // Their template puts their script tag inside the banner, immediately
    // above the markup, so at the point this runs there is no form to read
    // the categories off and no banner to take out.
    const parse = () => {
        const virtualConsole = new VirtualConsole();
        const lines = [];
        virtualConsole.on('info', message => { lines.push(String(message)); });
        const heard = [];
        const dom = new JSDOM(
            '<!doctype html><html lang="es"><head><title>t</title></head>' +
            '<body><p id="content">page</p>' +
            '<script>' + reject + '</script>' + banner() +
            '<p id="after">tail</p></body></html>',
            {
                url: URL_PAGE, runScripts: 'dangerously', virtualConsole,
                beforeParse(w) {
                    // A page's own listener, registered where a page
                    // registers one - after the resource has already run.
                    w.document.addEventListener('DOMContentLoaded', ( ) => {
                        w.document.addEventListener(
                            'cookie-consent-form-submit-successful',
                            event => { heard.push(event.detail); }
                        );
                    });
                },
            }
        );
        return { dom, w: dom.window, lines, heard };
    };

    it('reads their form and takes their banner out', async ( ) => {
        const { w } = parse();
        await settle(400);
        assert.equal(w.document.querySelector('.ch-cookie-consent'), null);
        assert.ok(w.document.getElementById('content'));
        assert.ok(w.document.getElementById('after'), 'and the rest parsed');
        assert.deepEqual(
            Array.from(w.chCookieConsentRR.state().refused),
            [ 'analytics', 'tracking', 'marketing' ]
        );
        assert.equal(cookies(w).get(CATEGORY + 'social_media'), undefined);
    });

    it('fires their event late enough for a page to hear it', async ( ) => {
        const { w, heard } = parse();
        await settle(400);
        assert.equal(heard.length, 1);
        assert.equal(
            heard[0].getAttribute('name'),
            'cookie_consent[use_only_functional_cookies]'
        );
    });

    // A line said at the top of the script would report refused=none on
    // every page that loads the way a page actually loads.
    it('says its line once, with what settled', async ( ) => {
        const { lines } = parse();
        await settle(400);
        const said = lines.filter(line => line.includes('chcookieconsent'));
        assert.equal(said.length, 1, said.join('\n'));
        assert.match(said[0], /cookie=Cookie_Consent written=5 blocked=0/);
        assert.match(said[0], /refused=analytics,tracking,marketing/);
        assert.match(said[0], /removed=1 told=1/);
        assert.match(said[0], /banner=none parked=none posted=none logged=none/);
    });

    it('says so on the line where it left their banner alone', async ( ) => {
        const jar = new CookieJar();
        const url = URL_PAGE;
        // All of them, as their own server sets them: a run where only the
        // consent cookie is theirs still stores the categories, and those
        // are a working refusal, so the banner goes in that case.
        for ( const line of [
            'Cookie_Consent=old; Path=/; HttpOnly',
            'Cookie_Consent_Key=68e1f0a1b2c3d; Path=/; HttpOnly',
            'Cookie_Category_analytics=true; Path=/; HttpOnly',
            'Cookie_Category_tracking=true; Path=/; HttpOnly',
            'Cookie_Category_marketing=true; Path=/; HttpOnly',
        ] ) { jar.setCookieSync(line, url); }
        const virtualConsole = new VirtualConsole();
        const lines = [];
        virtualConsole.on('info', message => { lines.push(String(message)); });
        new JSDOM(
            '<!doctype html><html lang="es"><head></head><body>' +
            '<script>' + reject + '</script>' + banner() + '</body></html>',
            { url, runScripts: 'dangerously', virtualConsole, cookieJar: jar }
        );
        await settle(80);
        const said = lines.filter(line => line.includes('chcookieconsent'));
        assert.equal(said.length, 1);
        assert.match(said[0], /written=0 blocked=5/);
        assert.match(said[0], /removed=0 told=0 banner=left/);
    });
});

/******************************************************************************/

describe('chcookieconsent, the list', ( ) => {
    it('is pinned at the version the package names', ( ) => {
        assert.equal(versions.chcookieconsent, '1.0.1');
    });

    // Every Symfony app serves the bundle's assets from the same path.
    it('names their bundle path, not a host', ( ) => {
        assert.ok(filtersText.includes(
            '/bundles/chcookieconsent/js/cookie_consent.js$script,' +
            'redirect=chcookieconsent-reject.js'
        ));
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            if ( line.includes('chcookieconsent') === false ) { continue; }
            assert.equal(/trapicheos/.test(line), false, line);
        }
    });

    it('leaves their stylesheet and their endpoint alone', ( ) => {
        for ( const line of filtersText.split('\n') ) {
            if ( line.startsWith('!') ) { continue; }
            assert.equal(/cookie_consent\.css/.test(line), false, line);
            assert.equal(/cookies\/save/.test(line), false, line);
        }
    });

    it('says in the list why it cannot be blocked instead', ( ) => {
        assert.match(filtersText, /THEIR SERVER WRITES THE CONSENT/);
        assert.match(filtersText, /type="button"/);
        assert.match(filtersText, /THEIR HTTP_ONLY DEFAULT/);
    });
});
