/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for tarteaucitron, hosted or self-hosted: no banner, their own
    refusal in their own cookie - one !service=false entry per service, under
    the name their configuration gives it - and the per-service events their
    own Google, Bing and Clarity glue listens for, so the refusal reaches the
    consent-mode layer rather than stopping at the cookie.

    Nothing is launched and nothing is reported: their pro() beacon, which
    posts the visitor's choice to logs.tarteaucitron.io with the site's uuid,
    is not sent.

    For a reader who wants the videos and the social embeds to work anyway,
    tarteaucitron-reject-unblock.js consents to those two types and refuses
    the rest.

*/

(function() {
    'use strict';
    // @include lib/tarteaucitron-core.js
    consentRRTarteaucitron('reject');
})();
