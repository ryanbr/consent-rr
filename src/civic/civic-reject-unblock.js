/*******************************************************************************

    consent-rr - cookie-consent resource replacements for uBlock Origin
    Copyright (C) 2026-present ryanbr

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/ryanbr/consent-rr

    Stands in for Civic Cookie Control's cookieControl-9.x.min.js, for a site
    that withholds content until a category is on: it accepts every optional
    category the site declares, runs each one's onAccept, and frees the tags
    parked for them - their own accept path, for all of them.

    This is the blunt instrument, for a redirect, which carries no arguments and
    so cannot be told which category a site gates its videos on. Point it at the
    sites that need it rather than at every Civic site:

        ||cc.cdn.civiccomputing.com/9/cookieControl-9*.js$script,
            redirect=civic-reject-unblock.js:10,domain=example.com

    The :10 raises its priority above the plain civic-reject.js rule, which
    matches the same request.

    Where one category is enough, civic-reject.js takes its name as a scriptlet
    argument and refuses the rest - the surgical version of this.

*/

(function() {
    'use strict';
    // @include lib/civic-tcf.js
    // @include lib/civic-core.js
    consentRRCivic(consentRRCivicTcf, true);
})();
