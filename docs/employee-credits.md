# Employee credits

Payment → Employee Credits is the central register of employee credit sales from main and outlet web sales.

1. A Payment manager registers an employee with a unique code. Identical names are not merged. Registration creates a linked main customer account, not a sale or payment.
2. In New Sale, select Employee credit. In outlet Sales Entries choose Employee Credit and the employee. An employee credit entry must belong to one employee; do not combine employee debts into a daily cash total.
3. Saving a sale uses the existing stock and historical COGS workflow once. Credit has no cash received. Sales revenue still belongs to the original location.
4. The central table shows original sales net of posted returns, settled amounts and remaining balances, with date/source/status filters and pagination.
5. Collect acts on the selected original receipt. Collections made here are received at MAIN. Main sale collections use Payment and PaymentAllocation, so existing payment history and authorized payment reversals still apply. Outlet collections use the outlet employee cash ledger tagged MAIN and do not inflate the outlet drawer or sales revenue.
6. Payment view permission reads all employee credits; Payment manage registers and collects. Cashiers can select employees for credit only within their authorized outlet. They cannot read the central debt register without Payment view access.

Legacy outlet employee IDs remain separate; no employee records are merged by name. Employee-funded purchases/reimbursements are not employee credit sales. Mobile credit entry is not changed by this web feature.

Verification: run the employee-credit-policy tests, TypeScript and build. Database lifecycle testing requires an authorized test database. No transaction reset or migration is run by installing this feature.
