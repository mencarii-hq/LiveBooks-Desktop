# Manual memorized-split payroll workflow

Until Pay Run automation is used, post simple payroll with a **memorized Payment that has signed splits**. Posting already supports this pattern (`PaymentSplit` + `testPaymentSplit.spec.ts`).

Terminology: the negative split lines are **deductions** (the Pay Run feature's term); on pay stubs these are commonly called withholdings.

## Chart of accounts

Ensure these (or equivalents) exist:

- **Salary** (Expense) — gross wages
- **Payroll Payable** and/or other withholding liabilities (Liability; not Receivable/Payable party control accounts) — tax/benefit withholdings
- A **Bank** (or Cash) account — net paycheck

## Split sign convention (Pay)

For a net paycheck of **2400** with gross **3000** and deductions **400 / 150 / 50**:

| Split account                   | Amount (signed) | Effect           |
| ------------------------------- | --------------- | ---------------- |
| Salary                          | +3000           | Debit expense    |
| Federal withholding (liability) | −400            | Credit liability |
| State withholding (liability)   | −150            | Credit liability |
| Local withholding (liability)   | −50             | Credit liability |

Signed sum of splits must equal the Payment **amount** (net): `3000 − 400 − 150 − 50 = 2400`.

GL result: Salary Dr 3000; withholdings Cr; bank Cr 2400.

## Steps in the app

1. Open the bank register → Write Entry (Pay / Check as needed).
2. Enter **net** pay as the payment amount and bank account.
3. Add **two or more** split lines: one positive gross (Salary), one negative line per deduction.
4. Set party to the employee (or create one). For Check + Print Later, the payment queues in **Checks to Print**.
5. **Memorize** the entry so the next period can recall the template; adjust amounts if hours/gross change.

## What this does not do

- No tax tables, filing, or Gusto — deduction amounts are entered (or memorized) by the user.
- Prefer the **Pay Run** page when available for rate × hours and repeated profiles.
