// WebSetu — the supplier's own details, as they must appear on a tax invoice.
//
// All from the environment, because they belong to the business running this
// deployment rather than to the code — and because a GSTIN in a repository is a
// GSTIN in every fork of it.
//
// A GST invoice in India has to carry the supplier's legal name, address and
// GSTIN, the invoice number and date, the place of supply, the SAC code for the
// service, and the tax split. Everything below exists to fill one of those.

export interface SupplierDetails {
  legalName: string;
  gstin: string;
  address: string;
  state: string;
  email: string;
  /** 998314 — "information technology infrastructure and support services". */
  sac: string;
  /** Whether enough is configured to issue a compliant tax invoice. */
  registered: boolean;
}

export function supplier(): SupplierDetails {
  const gstin = (process.env.PLATFORM_GSTIN || "").trim().toUpperCase();
  return {
    legalName: (process.env.PLATFORM_LEGAL_NAME || "WebSetu").trim(),
    gstin,
    address: (process.env.PLATFORM_ADDRESS || "").trim(),
    state: (process.env.PLATFORM_STATE || "").trim(),
    email: (process.env.SUPPORT_EMAIL || "").trim(),
    sac: (process.env.PLATFORM_SAC || "998314").trim(),
    // Without a GSTIN the document is a receipt, not a tax invoice, and must
    // not claim otherwise — a "tax invoice" with no GSTIN is worthless to the
    // customer and misleading on its face.
    registered: isValidGstin(gstin),
  };
}

/**
 * Shape check for a GSTIN: 2-digit state code, 10-character PAN, entity digit,
 * 'Z', checksum character.
 *
 * Deliberately structural rather than a checksum verification — the point is to
 * catch a typo or an empty value before it is printed on a document, not to
 * validate registration, which only the GST portal can do.
 */
export function isValidGstin(value: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(value ?? "").trim().toUpperCase());
}

/** State code embedded in a GSTIN, used to infer the supplier's state. */
export function stateCodeOf(gstin: string): string {
  return isValidGstin(gstin) ? gstin.slice(0, 2) : "";
}

export interface BillTo {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  email: string;
}

/** Snapshot of the customer's billing details, frozen onto the payment row. */
export function billToFrom(business: {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  email: string;
}): BillTo {
  return {
    name: business.name,
    address: business.address,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
    gstin: (business.gstin || "").trim().toUpperCase(),
    email: business.email,
  };
}

export function parseBillTo(json: string): BillTo | null {
  try {
    const parsed = JSON.parse(json || "{}") as Partial<BillTo>;
    if (!parsed.name) return null;
    return {
      name: parsed.name,
      address: parsed.address ?? "",
      city: parsed.city ?? "",
      state: parsed.state ?? "",
      pincode: parsed.pincode ?? "",
      gstin: parsed.gstin ?? "",
      email: parsed.email ?? "",
    };
  } catch {
    return null;
  }
}

/** Rupees for a document: grouped Indian-style, always two decimals. */
export function money(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}
