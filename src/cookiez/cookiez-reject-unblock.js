/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Cookiez, for a site that withholds something until a category is on.

    Stores and sends the same refusal as reject, and frees the scripts their
    blocker parked, by their own selector:

        script[type="text/plain"][data-cc-category="<category>"]
            :not([data-cc-mode="always"])

    The copy drops every data-cc- attribute and the type, takes its src from
    data-cc-src, keeps inline text and goes back in at the original position -
    all of which is what theirs does. A node marked data-cc-mode="always"
    stays parked, because that is their own never-free marker.

    Un-parking a tag claims no consent, and uBlock Origin still blocks
    whatever it then asks for.

*/

(function() {
    'use strict';
    // @include lib/cookiez-core.js
    consentRRCookiez('reject-unblock');
})();
