/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for the legacy Cookie Law Info plugin for WordPress, served by
    the site itself from
    /wp-content/plugins/cookie-law-info/js/cookielawinfo.js - WebToffee's
    "GDPR Cookie Consent", not the hosted CookieYes script, which has its own
    resource here.

    No banner, and their own decline in their own cookie: viewed_cookie_policy
    set to no, for their own 365 days, on their own path. Their banner shows on
    that cookie being absent rather than on its value, so a stored yes from
    before this was installed is overwritten.

    Their two globals go in - cli_show_cookiebar, which the page calls from an
    inline script with its own markup, and l1hs - because the file cannot be
    blocked instead: without the function that inline call is a ReferenceError
    that takes the rest of its block with it.

    One resource, because that is the whole plugin: not one script is blocked
    or parked by any version of it, no category is named and there is no api.
    There is nothing to un-block and nothing to accept.

*/

(function() {
    'use strict';
    // @include lib/cookielawinfo-core.js
    consentRRCookieLawInfo();
})();
