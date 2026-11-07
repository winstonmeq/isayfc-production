# Action permission update

Existing database roles are not modified automatically. After deployment, an
administrator should review Users → Roles and explicitly assign these controls:

| Action | Permission |
| --- | --- |
| Create outlet sales | `pos.manage` |
| Receive / reject incoming outlet items | `stock-transfers.confirm` |
| Outlet production / mixing | `outlet-repack.manage` |
| Outlet expenses and stock usage | `pos.expenses.manage` |
| Outlet menu changes | `pos.menu.manage` |
| Manual outlet stock deduction | `pos.deductions.manage` |
| Outlet stock correction / spoilage / return requests | `outlet-inventory.manage` |
| Operate other outlets (non-cashier supervisors) | `pos.all-outlets` |
| Approve / reject main customer returns | `customer-returns.approve` |
| Post main customer return settlement | Both `inventory-adjustments.manage` and `payments.manage` |
| Shared main report and outlet report print buttons | `reports.print` |

`pos.manage` no longer grants unrelated outlet mutations. Comparison report
access no longer grants cross-outlet operational scope. Assign `pos.all-outlets`
explicitly to supervisors who need store selection. Cashiers remain restricted
to their assigned outlet, even with that permission.

New outlet action permissions include the outlet page's read permission.
Approval includes access to view the adjustment page but not permission to post.
Updated role presets apply when selected; they do not silently rewrite saved roles.

Payment receipt attachments now require finance read/write or payment-report
access and are served with private/no-store caching. Previously cached copies
cannot be recalled. Public menu images remain public.

Print permission controls the application's shared report buttons, not native
browser printing, screenshots, or copying already-authorized data. Existing
resource `manage` permissions still bundle some create/edit/void operations;
this update is not a claim that every application action has its own permission.

Validate after assigning a role: sign in as that user, test an allowed action,
test denied actions directly against the API (expect 403), and test a different
outlet ID. API permission cache refreshes within 30 seconds; role/user edits
invalidate the current process cache immediately. No business records should be
created on live data solely to test authorization.
