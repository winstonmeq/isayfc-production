# Login history

Administrators can open Users → Login History (`/login-history`). This is an
administrator-only page, not a permission assignable to other roles.

New web sign-ins record the user's name and role at login, success or failure,
and a server timestamp. Unknown usernames are stored as the attempted identifier.
Passwords, authentication tokens, and request bodies are not captured. Rate-limit
blocked or incomplete submissions are not recorded as individual failed logins.

Each successful web login has its own record, so signing out one browser does not
mark other browser sessions as logged out. Explicit NextAuth sign-out records
the logout timestamp. Closing a tab/browser does not create a logout event.

The shared application shell sends a throttled same-origin heartbeat on visible
page load and user interaction, not an idle background timer. The server derives
the user/session from authentication, never from client-submitted identifiers.
“Recently active” means interaction within five minutes; it is not guaranteed
online presence. The page is manually refreshed and dates are filtered in Manila
time. Page size defaults to 25, with server-side search/filter/pagination.

Sessions created before deployment have no history ID and will not acquire a
fabricated historical login. Sign in again to start tracking. Mobile bearer-token
logins are not included. Logging failures are reported to the server console and
do not prevent login/logout; this is monitoring, not a tamper-proof security log.
Protect database access and backups. No existing transactions or users are reset.
