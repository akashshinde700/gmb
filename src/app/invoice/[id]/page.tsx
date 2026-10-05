import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { money, parseBillTo, supplier } from "@/lib/invoice";

/**
 * A printable tax invoice at /invoice/[id].
 *
 * Rendered as a page rather than generated as a PDF: the browser's own "Print →
 * Save as PDF" produces a better document than a bundled PDF library, on every
 * platform, with no dependency and no fonts to ship.
 *
 * Everything shown comes from the columns frozen onto the payment row when it
 * was created. Nothing is recomputed at render time — an invoice must look the
 * same in three years as it did on the day it was issued, whatever has changed
 * about the customer, the plan price, or the GST rate since.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const metadata: Metadata = {
  title: "Tax invoice",
  robots: { index: false, follow: false },
};

export default async function InvoicePage({ params }: Params) {
  const { id } = await params;

  // Deliberately not using the `route()` helper: this is a page, and an
  // unauthenticated visitor must get a 404 rather than a JSON error — the id
  // should not confirm that an invoice exists.
  const headerList = await import("next/headers").then((m) => m.headers());
  const session = await getSessionUser(
    new Request("http://internal/", { headers: headerList }),
  );
  if (!session) notFound();

  const payment = await db.payment.findUnique({
    where: { id },
    include: { business: { select: { userId: true, name: true } } },
  });
  if (!payment) notFound();

  // An invoice belongs to the customer it was issued to. Admins can open any,
  // because support needs to see what the customer is looking at.
  const owned = payment.business?.userId === session.id;
  if (!owned && session.role !== "ADMIN") notFound();

  const from = supplier();
  const billTo = parseBillTo(payment.billToJson);
  const issued = payment.createdAt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const isTaxInvoice = from.registered && payment.taxAmount > 0;

  return (
    <main className="mx-auto max-w-3xl bg-white p-6 text-zinc-900 sm:p-10 print:p-0">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 14mm; } }`}</style>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-600">
          Use your browser&apos;s print dialog to save this as a PDF.
        </p>
        <a
          href="/#/dashboard"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
        >
          Back to dashboard
        </a>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-zinc-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isTaxInvoice ? "Tax Invoice" : "Payment Receipt"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {payment.invoiceNo || payment.id}
            {" · "}
            {issued}
          </p>
          {payment.status !== "SUCCESS" && (
            <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {payment.status}
            </p>
          )}
        </div>
        <div className="text-right text-sm">
          <p className="text-base font-bold">{from.legalName}</p>
          {from.address && <p className="mt-1 whitespace-pre-line text-zinc-600">{from.address}</p>}
          {from.state && <p className="text-zinc-600">{from.state}</p>}
          {from.gstin && <p className="mt-1 text-zinc-600">GSTIN: {from.gstin}</p>}
          {from.email && <p className="text-zinc-600">{from.email}</p>}
        </div>
      </header>

      <section className="grid gap-6 border-b border-zinc-200 py-6 sm:grid-cols-2">
        <div className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Bill to</p>
          <p className="mt-1 font-semibold">{billTo?.name ?? payment.business?.name ?? "—"}</p>
          {billTo?.address && <p className="text-zinc-600">{billTo.address}</p>}
          {(billTo?.city || billTo?.pincode) && (
            <p className="text-zinc-600">
              {[billTo?.city, billTo?.pincode].filter(Boolean).join(" ")}
            </p>
          )}
          {billTo?.state && <p className="text-zinc-600">{billTo.state}</p>}
          {billTo?.gstin && <p className="mt-1 text-zinc-600">GSTIN: {billTo.gstin}</p>}
        </div>
        <div className="text-sm sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Details</p>
          {payment.placeOfSupply && (
            <p className="mt-1 text-zinc-600">Place of supply: {payment.placeOfSupply}</p>
          )}
          <p className="text-zinc-600">Payment method: {payment.method}</p>
          {payment.gatewayPaymentId && (
            <p className="text-zinc-600">Reference: {payment.gatewayPaymentId}</p>
          )}
          {payment.couponCode && <p className="text-zinc-600">Coupon: {payment.couponCode}</p>}
        </div>
      </section>

      <table className="w-full border-collapse py-6 text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
            <th className="py-3">Description</th>
            {isTaxInvoice && <th className="py-3">SAC</th>}
            <th className="py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-100">
            <td className="py-3">{payment.description || "Subscription"}</td>
            {isTaxInvoice && <td className="py-3 text-zinc-500">{from.sac}</td>}
            <td className="py-3 text-right">
              {money(payment.taxableAmount || payment.amount)}
            </td>
          </tr>
        </tbody>
      </table>

      <section className="ml-auto max-w-xs space-y-1 text-sm">
        {payment.taxAmount > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-zinc-500">Taxable value</span>
              <span>{money(payment.taxableAmount)}</span>
            </div>
            {payment.igst > 0 ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">IGST @ {payment.taxRate}%</span>
                <span>{money(payment.igst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-500">CGST @ {payment.taxRate / 2}%</span>
                  <span>{money(payment.cgst)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">SGST @ {payment.taxRate / 2}%</span>
                  <span>{money(payment.sgst)}</span>
                </div>
              </>
            )}
          </>
        )}
        <div className="flex justify-between border-t border-zinc-300 pt-2 text-base font-bold">
          <span>Total</span>
          <span>{money(payment.amount)}</span>
        </div>
      </section>

      <footer className="mt-10 border-t border-zinc-200 pt-6 text-xs leading-relaxed text-zinc-500">
        {isTaxInvoice ? (
          <p>
            This is a computer-generated tax invoice and does not require a signature. Tax is
            payable under forward charge.
          </p>
        ) : (
          // Calling a document a tax invoice without a GSTIN on it would be
          // worthless to the customer and misleading on its face.
          <p>
            This is a payment receipt, not a tax invoice — no GST registration is on file for the
            supplier.
          </p>
        )}
      </footer>
    </main>
  );
}
