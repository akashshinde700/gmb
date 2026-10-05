// WebSetu — GST arithmetic and the intra/inter-state split.
//
// No other imports, so it can be unit-tested by running the file directly, and
// so the server and the dashboard compute the same number from the same code
// rather than two copies of the same formula.
//
// GST is added ON TOP of the listed plan price: the pricing page quotes ₹999
// and the customer is charged ₹1,179. Doing it the other way — treating the
// listed price as tax-inclusive — would quietly cut actual plan revenue by 15%,
// which is the kind of mistake nobody notices until the accounts are done.

/** GST on a taxable amount, rounded to whole rupees. */
export function gstFor(taxableAmount: number, rate: number): number {
  if (!Number.isFinite(taxableAmount) || taxableAmount <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  // Whole rupees: the gateway settles in paise, but a fractional paisa of tax
  // on an invoice is a figure no accountant can reconcile.
  return Math.round(taxableAmount * (rate / 100));
}

/** What the customer actually pays: taxable amount plus GST. */
export function totalWithGst(taxableAmount: number, rate: number): number {
  const base = Number.isFinite(taxableAmount) && taxableAmount > 0 ? taxableAmount : 0;
  return base + gstFor(base, rate);
}

/** Normalise a state name for comparison: case, spacing and punctuation vary. */
export function normalizeState(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export interface GstSplit {
  cgst: number;
  sgst: number;
  igst: number;
  /** True when supplier and customer are in the same state. */
  intraState: boolean;
}

/**
 * Split GST into CGST+SGST or IGST.
 *
 * Same state as the supplier: the tax is halved into central and state
 * components. Different state, or no state on file: it is one inter-state
 * amount. Getting this wrong does not change what the customer pays, but it
 * files the tax under the wrong head, which is a correction with the
 * department rather than an edit in the app.
 *
 * An unknown customer state is treated as inter-state deliberately. IGST on an
 * intra-state sale is a reclaimable error; the reverse leaves the supplier
 * short against a state that was never paid.
 */
export function splitGst(taxAmount: number, supplierState: string, customerState: string): GstSplit {
  const total = Number.isFinite(taxAmount) && taxAmount > 0 ? taxAmount : 0;
  if (total === 0) return { cgst: 0, sgst: 0, igst: 0, intraState: false };

  const supplier = normalizeState(supplierState);
  const customer = normalizeState(customerState);
  const intraState = !!supplier && !!customer && supplier === customer;

  if (!intraState) return { cgst: 0, sgst: 0, igst: total, intraState: false };

  // Halved so the two components always add back to the total: a naive
  // round(total/2) twice can be a rupee out on an odd figure.
  const cgst = Math.floor(total / 2);
  return { cgst, sgst: total - cgst, igst: 0, intraState: true };
}
