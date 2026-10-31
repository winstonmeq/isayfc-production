"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { manilaDateString } from "@/lib/date-utils";

type Employee = { _id: string; name: string };
type Credit = { _id: string; employeeId: string; employeeName: string; receiptNumber: string; totalAmount: number; paidAmount: number; balance: number };
type Purchase = { _id: string; employeeId: string; employeeName: string; productName: string; quantity: number; unit: string; amount: number; reimbursed: number; supplier: string; receipt: string; purchaseDate: string };
type Movement = { _id: string; employeeName: string; kind: string; amount: number; businessDate: string };
type Data = { employees: Employee[]; credits: Credit[]; purchases: Purchase[]; movements: Movement[]; cash: { cashSales: number; collections: number; expenses: number; reimbursements: number; netCashMovement: number } };
type Stock = { id: string; productName: string; unitLabel: string };
const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export function EmployeeAccounts({ outletId, inventory, onChanged, onClose, onCreditSale }: { outletId: string; inventory: Stock[]; onChanged: () => void; onClose: () => void; onCreditSale: (employee: Employee) => void }) {
  const { data: session } = useSession();
  const role = String(session?.user?.roleName || session?.user?.role || "").toUpperCase();
  const canSettle = role === "ADMIN" || session?.user?.permissions?.includes("pos.employee-finance.manage");
  const [tab, setTab] = useState<"employees" | "purchase" | "credit" | "cash">("employees");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => manilaDateString());
  const [data, setData] = useState<Data | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [productName, setProductName] = useState("");
  const [unit, setUnit] = useState("QTY");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [receipt, setReceipt] = useState("");
  const [settlement, setSettlement] = useState<{ action: "COLLECT" | "REIMBURSE"; referenceId: string; employeeId: string; maximum: number; name: string } | null>(null);
  const [payment, setPayment] = useState("");
  const request = useRef<{ payload: string; key: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/pos/employee-finance?outletId=${outletId}&date=${date}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setData(result);
    } catch (error) { setData(null); setNotice(error instanceof Error ? error.message : "Unable to load employee accounts."); }
    finally { setLoading(false); }
  }, [date, outletId]);
  useEffect(() => { void load(); }, [load]);

  async function save(values: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setNotice("");
    const body = { ...values, outletId, date };
    const payload = JSON.stringify(body);
    if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/pos/employee-finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestKey: request.current.key }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      request.current = null;
      setNotice(result.message); setSettlement(null); setPayment("");
      if (values.action === "EMPLOYEE") setEmployeeName("");
      if (values.action === "PURCHASE") { setQuantity(""); setAmount(""); setReceipt(""); }
      await load(); onChanged();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 p-4"><section className="mx-auto my-4 max-w-7xl rounded-3xl bg-white p-6 shadow-xl">
    <div className="sticky top-0 z-10 -mx-6 -mt-6 flex flex-wrap items-center justify-between gap-4 border-b bg-white px-6 py-4"><h2 className="text-xl font-bold">Employee Accounts</h2><Button variant="outline" onClick={onClose}>Close</Button></div>
    
    <label className="mt-4 block max-w-xs text-sm font-bold">Business date<Input type="date" max={manilaDateString()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
    {notice && <p role="status" className="my-4 rounded-xl bg-amber-50 p-3">{notice}</p>}
    <div className="my-4 flex flex-wrap gap-2" role="tablist" aria-label="Employee account tasks">{([["employees", "Employees"], ["purchase", "Outside Purchases"], ["credit", "Credit & Collections"], ["cash", "Daily Cash"]] as const).map(([key, label]) => <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? "default" : "outline"} onClick={() => { setTab(key); setSettlement(null); }}>{label}</Button>)}</div>
    {loading && <p role="status" className="my-3 text-sm text-slate-500">Loading employee accounts…</p>}
    <div className="mt-4">
      <section hidden={tab !== "employees"} className="rounded-xl border p-4"><h3 className="font-black">Outlet Employees ({data?.employees.length || 0})</h3><div className="mt-2 flex gap-2"><Input placeholder="Employee full name" maxLength={100} value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} /><Button disabled={busy || loading || !employeeName.trim()} onClick={() => void save({ action: "EMPLOYEE", name: employeeName })}>Add</Button></div>
        <Input className="my-4 max-w-sm" placeholder="Search employee…" aria-label="Search employee" value={search} onChange={event => setSearch(event.target.value)} />
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">Employee</th><th className="p-3 text-right">Credit Owed by Employee</th><th className="p-3 text-right">Reimbursement Owed to Employee</th><th className="p-3 text-right">Action</th></tr></thead><tbody>
          {data?.employees.filter(employee => employee.name.toLowerCase().includes(search.toLowerCase())).map(employee => <tr key={employee._id} className="border-t"><td className="p-3 font-semibold">{employee.name}</td><td className="p-3 text-right">{peso(data.credits.filter(row => row.employeeId === employee._id).reduce((sum, row) => sum + row.balance, 0))}</td><td className="p-3 text-right">{peso(data.purchases.filter(row => row.employeeId === employee._id).reduce((sum, row) => sum + row.amount - row.reimbursed, 0))}</td><td className="p-3"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" disabled={busy || loading} onClick={() => onCreditSale(employee)}>Add Credit Sale</Button><Button size="sm" variant="outline" onClick={() => { setEmployeeId(employee._id); setTab("purchase"); }}>Add Purchase</Button></div></td></tr>)}
          {!loading && !data?.employees.some(employee => employee.name.toLowerCase().includes(search.toLowerCase())) && <tr><td colSpan={4} className="p-6 text-center text-slate-500">No employees found. Add an employee above.</td></tr>}
        </tbody></table></div>
      </section>
      <section hidden={tab !== "purchase"} className="rounded-xl border p-4"><h3 className="font-black">Add Outside Purchase</h3><p className="my-2 text-xs text-slate-500">Use base quantities (e.g. 50 PCS, not 1 pack) and the full receipt cost.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Employee<select aria-label="Purchasing employee" className="mt-1 w-full rounded-lg border p-2" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Select employee</option>{data?.employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name}</option>)}</select></label>
          <label>Stock item<select className="mt-1 w-full rounded-lg border p-2" value={inventoryId} onChange={(event) => setInventoryId(event.target.value)}><option value="">New outside ingredient</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.productName} ({item.unitLabel})</option>)}</select></label>
          {!inventoryId && <><label>New ingredient name<Input value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={100} /></label><label>Base unit<select className="w-full rounded-lg border p-2" value={unit} onChange={(event) => setUnit(event.target.value)}>{["QTY", "KG", "PCS", "HEAD"].map((unit) => <option key={unit}>{unit}</option>)}</select></label></>}
          <label>Base quantity<Input type="number" min="0.0001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Total purchase cost<Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label>Outside supplier<Input value={supplier} maxLength={150} onChange={(event) => setSupplier(event.target.value)} /></label><label>Receipt / reference<Input value={receipt} maxLength={150} onChange={(event) => setReceipt(event.target.value)} /></label>
        </div><Button className="mt-3" disabled={busy || !employeeId || !date || !supplier.trim() || !receipt.trim() || (!inventoryId && !productName.trim()) || Number(quantity) <= 0 || Number(amount) <= 0} onClick={() => void save({ action: "PURCHASE", employeeId, inventoryId, productName, unit, quantity: Number(quantity), amount: Number(amount), supplier, receipt })}>Receive Stock</Button>
      </section>
    </div>
    <section hidden={tab !== "credit"} className="mt-6 overflow-x-auto"><h3 className="mb-2 font-black">Outstanding Employee Credit (all dates)</h3><table className="w-full text-sm"><thead className="bg-slate-100"><tr>{["Employee", "Receipt", "Sale", "Paid", "Balance", "Action"].map((title) => <th className="p-3 text-left" key={title}>{title}</th>)}</tr></thead><tbody>{data?.credits.map((sale) => <tr key={sale._id} className="border-b"><td className="p-3">{sale.employeeName}</td><td>{sale.receiptNumber}</td><td>{peso(sale.totalAmount)}</td><td>{peso(sale.paidAmount)}</td><td className="font-bold">{peso(sale.balance)}</td><td><Button size="sm" disabled={!canSettle || busy || loading} onClick={() => { setSettlement({ action: "COLLECT", referenceId: sale._id, employeeId: sale.employeeId, maximum: sale.balance, name: sale.employeeName }); setPayment(String(sale.balance)); }}>Collect cash</Button></td></tr>)}</tbody><tfoot><tr className="bg-slate-50 font-bold"><td colSpan={4} className="p-3">TOTAL OUTSTANDING CREDIT</td><td>{peso(data?.credits.reduce((sum, row) => sum + row.balance, 0) || 0)}</td><td /></tr></tfoot></table></section>
    <section hidden={tab !== "purchase"} className="mt-6 overflow-x-auto"><h3 className="mb-2 font-black">Purchases & Reimbursements (all dates)</h3><table className="w-full min-w-[800px] text-sm"><thead className="bg-slate-100"><tr>{["Employee", "Date", "Product / Qty", "Receipt", "Cost", "Reimbursed", "Owed", "Action"].map((title) => <th className="p-3 text-left" key={title}>{title}</th>)}</tr></thead><tbody>{data?.purchases.map((purchase) => <tr className="border-b" key={purchase._id}><td className="p-3">{purchase.employeeName}</td><td>{manilaDateString(new Date(purchase.purchaseDate))}</td><td>{purchase.productName} / {purchase.quantity} {purchase.unit}</td><td>{purchase.supplier} / {purchase.receipt}</td><td>{peso(purchase.amount)}</td><td>{peso(purchase.reimbursed)}</td><td>{peso(purchase.amount - purchase.reimbursed)}</td><td><Button size="sm" disabled={!canSettle || busy || purchase.reimbursed >= purchase.amount} onClick={() => { const maximum = Math.round((purchase.amount - purchase.reimbursed) * 100) / 100; setSettlement({ action: "REIMBURSE", referenceId: purchase._id, employeeId: purchase.employeeId, maximum, name: purchase.employeeName }); setPayment(String(maximum)); }}>Reimburse cash</Button></td></tr>)}</tbody><tfoot><tr className="bg-slate-50 font-bold"><td colSpan={6} className="p-3">TOTAL OWED TO EMPLOYEES</td><td>{peso(data?.purchases.reduce((sum, row) => sum + row.amount - row.reimbursed, 0) || 0)}</td><td /></tr></tfoot></table></section>
    {settlement && <section className="my-5 rounded-xl border-2 border-blue-500 p-4"><h3 className="font-black">{settlement.action === "COLLECT" ? "Collect from" : "Reimburse"} {settlement.name} — {date}</h3><div className="mt-3 flex gap-3"><Input type="number" min="0.01" step="0.01" max={settlement.maximum} value={payment} onChange={(event) => setPayment(event.target.value)} /><Button disabled={busy || !date || Number(payment) <= 0 || Number(payment) > settlement.maximum} onClick={() => void save({ ...settlement, amount: Number(payment) })}>Confirm cash {settlement.action === "COLLECT" ? "receipt" : "payment"}</Button><Button variant="outline" onClick={() => setSettlement(null)}>Cancel</Button></div></section>}
    {!canSettle && <p className="mt-3 text-sm text-amber-800">Collections and reimbursements require the Employee Finance permission. Ask an administrator.</p>}
    {data && <section hidden={tab !== "cash"} className="mt-6"><h3 className="font-black">Outlet cash movement — {date} (not profit)</h3><table className="mt-2 w-full text-sm"><tbody>{[["Cash sales", data.cash.cashSales], ["Employee collections", data.cash.collections], ["Less: outlet cash expenses", -data.cash.expenses], ["Less: employee reimbursements", -data.cash.reimbursements], ["NET CASH MOVEMENT (excludes opening cash / remittances)", data.cash.netCashMovement]].map(([label, value]) => <tr key={label} className="border-b last:bg-slate-100 last:font-black"><td className="p-3">{label}</td><td className="text-right">{peso(Number(value))}</td></tr>)}</tbody></table><h4 className="mt-4 font-bold">Collections / reimbursements for this day</h4>{data.movements.map((movement) => <p className="border-b py-2 text-sm" key={movement._id}>{movement.employeeName} — {movement.kind.replaceAll("_", " ")} — {peso(movement.amount)}</p>)}</section>}
  </section></div>;
}
