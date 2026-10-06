/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr
    SPDX-License-Identifier: GPL-3.0-or-later

    Home: https://github.com/ryanbr/consent-rr

    iubenda, for when you actually mean it - which on their deployments is
    often the only way past the page. Their Cookie Solution is frequently run
    as a consent wall, and a wall answers to the record rather than to the
    tags: a refusal that frees the parked scripts still leaves the wall up.

    So this grants: every purpose their configuration names is true in their
    own record, Google consent mode is told granted through their own
    mapping, the IAB string consents to their own vendor count - 1223, from
    their loader - and the tags their auto-blocker parked are freed, which is
    what their own accept does.

    This consents on your behalf. It is the resource to reach for when the
    alternative is not reading the page, and iubenda-reject.js is the default
    everywhere else.

*/

(function() {
    'use strict';
    // @include lib/iubenda-core.js
    // @include lib/iubenda-tcf.js
    consentRRIubenda('accept', consentRRIubendaTcf);
})();
