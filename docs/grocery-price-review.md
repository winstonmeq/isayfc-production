# Grocery selling price review

Purchasing continues to compute weighted inventory cost. A changed cost, changed latest purchase unit cost, or missing selling price flags the grocery product for review. Editing or voiding a purchase also flags resulting inventory-cost changes. Selling price is never automatically raised or lowered.

In Workspace > Grocery Products, select **Price review required** to find pending products. Open **Review Price**, enter the approved selling price and a reason, then approve. Retaining the existing selling price is allowed after review, including a below-cost price (negative margin is highlighted). Only ADMIN or users with **products.manage** can approve; the permission label now explicitly includes selling-price approval. Assign this permission only to authorized product/pricing managers.

New main sales and new manual grocery delivery preparation reject pending products on the server. Already-saved sales/deliveries keep their original price and can still be fulfilled. Outlet menu pricing is separate and is not changed. Existing products are not flagged retroactively until their cost changes.

Approval updates only the product selling price and clears its flag. It does not update old sale lines, balances, inventory quantities, or report history. Price and approval history are committed together. If cost or stock changes while a manager reviews, reopen the review to load current values. History displays the latest 50 approvals.

No automatic markup rule was introduced because the owner has not specified a markup percentage. Margin shown is (selling price minus current inventory unit cost) divided by selling price, before discounts and expenses.
