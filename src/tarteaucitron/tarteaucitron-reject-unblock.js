/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    tarteaucitron, consenting to the two types a reader loses by refusing and
    refusing everything else.

    Their own model makes the cut rather than a guess: every service in their
    bundle carries a type, and of the 247 in 1.35.0 there are 26 video and 21
    social against 67 analytic, 51 ads, 29 api, 23 support, 22 other, 6
    google and 2 comment. video and social are consented to and started;
    the rest are refused in their own cookie exactly as reject does.

    A consented service is started by its own launcher - their
    services[key].js() - which builds its embed through this file's fallback,
    getElemAttr and getStyleSize. Those are implemented rather than stubbed,
    or an embed that is consented to would still not appear.

    Where the page did not load their services bundle itself, this fetches
    that one file, which is the request the replaced file makes anyway. A
    service whose type is not known yet is refused in the meantime, so a
    bundle that never arrives leaves everything refused.

*/

(function() {
    'use strict';
    // @include lib/tarteaucitron-core.js
    consentRRTarteaucitron('reject-unblock');
})();
