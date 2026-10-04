/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for consentmanager.net: no banner, their own __cmp answering a
    refusal, the IAB layer refused as cmpId 31 with euconsent-v2 written, and
    their events fired where they fire them - cmpEvent at the window, their
    WordPress bridge at the document.

    One rule takes better than half a megabyte with it: their bootstrap
    builds the cmp.php url and loads a 493KB bundle, and cmp.php itself
    requests 43-147KB of per-tenant custom data.

    Their own consent record is not written. It is named from a consentscope
    and a tenant id that live only in the file being replaced, and nothing
    outside that file reads it.

*/

(function() {
    'use strict';
    // @include lib/consentmanager-core.js
    // @include lib/consentmanager-tcf.js
    consentRRConsentManager('reject', consentRRConsentManagerTcf);
})();
