/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    WebToffee's GDPR Cookie Consent for WordPress, for a site that withholds
    something until a category is on.

    Stores the same refusal as webtoffee-reject.js - their three records all
    say no - and separately tells the page that every category is allowed,
    then releases what their blocker parked, by their own contract:

        script[data-cli-class="cli-blocker-script"]
        data-cli-src, data-cli-script-type, data-cli-label,
        data-cli-placeholder, data-cli-element-position

    The copy carries only the attributes their own insertScript allows
    through, takes its type from data-cli-script-type and its src from
    data-cli-src, and chains on load so their order holds. An iframe or an
    image of theirs goes back to its own src in place, as their
    renderSrcElement does it.

    Freeing a tag claims no consent, and uBlock Origin still blocks whatever
    it then asks for.

*/

(function() {
    'use strict';
    // @include lib/webtoffee-core.js
    consentRRWebToffee('reject-unblock');
})();
