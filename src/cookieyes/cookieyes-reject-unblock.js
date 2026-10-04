/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    CookieYes, for a site that withholds something until a category is on.

    Stores and sends the same refusal as reject - the cookie says necessary
    only, and the IAB layer refuses as cmpId 401 - while telling the page's
    own scripts every category is on, and letting the tags their plugin
    parked in the markup go: a type="text/plain" with
    data-cookieyes="cookieyes-analytics" is replaced by a copy that runs,
    which is what their own un-parking does.

    Un-parking a tag claims no consent, and uBlock Origin still blocks
    whatever it then asks for.

*/

(function() {
    'use strict';
    // @include lib/cookieyes-core.js
    // @include lib/cookieyes-tcf.js
    consentRRCookieYes('reject-unblock', consentRRCookieYesTcf);
})();
