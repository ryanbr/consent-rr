/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for WebToffee's GDPR Cookie Consent for WordPress, the version
    that blocks scripts - /public/js/cookie-law-info-public.js, under the
    webtoffee-gdpr-cookie-consent slug or the older cookie-law-info one. The
    legacy single-file version has its own resource here,
    cookielawinfo-reject.js.

    No banner, and their own reject button's work, in their own order: every
    non-necessary category cookie erased rather than set to no, which is what
    their reject_close does, then viewed_cookie_policy as no,
    cli_user_preference as their dash-joined string, and CookieLawInfoConsent
    as base64 of their JSON carrying their consentVersion and every category
    as the string false.

    Their banner is printed into the page by PHP rather than built by this
    file, so the bar, the show-again tab, their settings popup and its overlay
    are taken out - a script that would have hidden them is no longer there.

    Their CLI and CLI_Cookie go back, method for method, because a page and a
    theme both call them. Nothing is posted to their logging endpoint.

    The scripts their blocker parked stay parked, which is the whole point of
    their blocker. Use webtoffee-reject-unblock.js on a site that withholds
    something until a category is on.

*/

(function() {
    'use strict';
    // @include lib/webtoffee-core.js
    consentRRWebToffee('reject');
})();
