# Separate business testing

Run `npm run test:setup` once, then `npm run dev:business-test`.
Open **http://127.0.0.1:3100** (not the live website). Sign in using an existing account copied at setup time.

The dedicated `letson_business_test` database contains copied master settings and users, with zero product stock and no copied transactions. Setup refuses to overwrite an existing database. Live data is only read. Test uploads and Next build files use separate folders. Uploaded master-product pictures are not copied.

Keep this environment on your own computer: copied users and settings are still private business data. The MongoDB account must have permission to create/access the test database. Stop with Ctrl+C. Restarting changes the test session secret, requiring login again.

### MongoDB permission error (code 8000)

If the connection works but Atlas says the user is not allowed to run `listCollections` on `letson_business_test`, open **Atlas > Database Access**, edit the database user used by this app, and add the **readWrite** role scoped to **letson_business_test**. Keep the existing live database roles unchanged. Do not grant access to every database just for testing. Save, allow the permission update to apply, then rerun `npm run test:setup`.

## Manual acceptance test

1. Receive chicken with known heads, actual kilos and purchase price; receive grocery ingredients.
2. Slice chicken. Confirm heads/kilos decrease and actual cut pieces increase; check batch costs and reconciliation.
3. Create a main production batch with chicken, ingredients and actual finished kilos. Confirm all input deductions and output unit cost.
4. Sell to an external customer; record payment. Check inventory, sales, COGS and customer balance.
5. Sell/deliver to an owner outlet; receive each item. Check only accepted stock appears at that outlet and payment follows the owner-outlet policy.
6. Mix outlet ingredients into a menu item, sell part of the output, and confirm finished stock decreases exactly once.
7. Add a cash expense and stock usage. Check profit and cash separately; stock usage must not deduct cash again.
8. Test a return, reversal and insufficient-stock rejection. Confirm no duplicate stock or payment posting.
9. Compare main, outlet and overall reports against your written quantities/costs. Print each report.

Passing these checks is required before live use. Creating this environment alone does not certify accounting correctness or production readiness.
