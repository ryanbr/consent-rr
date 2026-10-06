/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    Stands in for AMP's own consent extension, amp-consent, served from
    cdn.ampproject.org/v0/amp-consent-0.1.mjs and its classic and -latest
    twins.

    No banner, and their own refusal: consentState REJECTED, in their own
    store under amp-consent:<consentInstanceId>, and every consent policy
    answered with their own unblockOn arithmetic rather than a verdict made up
    here. An element waiting on the default policy stays blocked, because that
    is what their reject button does; one waiting on _till_responded goes
    ahead, because a refusal is a response.

    Nothing is requested: no checkConsentHref, no prompt iframe, no
    onUpdateHref.

    Blocking the file instead of replacing it is not an option: the AMP runtime
    will not build any element carrying data-block-on-consent until this
    extension registers its service, so a block leaves the gated parts of the
    page unbuilt for ever - ads, but videos and images too.

    Use ampconsent-reject-unblock.js on a page that withholds content behind
    the default policy.

*/

(function() {
    'use strict';
    // @include lib/ampconsent-core.js
    consentRRAmpConsent('reject');
})();
