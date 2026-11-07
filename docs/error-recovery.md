# Error recovery

Both normal page rendering errors and root-layout errors use a standalone recovery
screen, independent of session providers and global styles. Try Again uses the
installed Next.js retry callback when available, with reset as fallback. Reload
and Sign In are also available. No transaction is automatically resubmitted.

If saving failed, users must verify the transaction list before trying again.
A rendering or network error does not prove the server rolled back a transaction.
Unsaved form entries may be lost during recovery.

Authenticated page errors are reported to Audit Logs under `SYSTEM_ERRORS`.
Search the displayed reference in Audit Logs; the matching server digest is
included when available. Client reports are explicitly marked client-reported,
not proof of a server-side exception. The endpoint requires an active same-origin
session, caps requests at 2 KB, and allows five reports per user per minute per
server process. It accepts no user identity from the request body.

Raw exception messages, stacks, form data, cookies, tokens and URL query strings
are not stored. Login History and session-activity APIs catch unexpected failures
and return generic JSON with HTTP 503 and a reference instead of framework HTML.
The logger itself catches persistence failures and logs a reference to the server
console; it does not recursively report failures. When authentication, JavaScript,
network, or MongoDB is unavailable, a client report may not reach Audit Logs.

This is targeted recovery and reporting, not comprehensive instrumentation of
every API, event-handler exception, rejected promise, or server failure. Existing
API error handling remains unchanged elsewhere. Use production server logs for
deeper investigation. No errors were injected into live business transactions.
