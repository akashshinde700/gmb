"use client";
// WebSetu — the shop's order book.
//
// A shop that takes orders online needs one screen that answers three questions
// in the order a shopkeeper asks them: what came in, what do I have to do about
// it, and how much did I actually earn. So the page is a list sorted newest
// first with the open ones on top, one row per order, and a detail panel that
// moves it along.
//
// The status buttons are built from lib/commerce.nextStatuses — the same list
// the API validates against — so the buttons can never offer a move the server
// will refuse.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download, ExternalLink, Loader2, MapPin, Package, Phone, RefreshCw, Settings2, ShoppingBag, Truck, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, errMsg, PageHeader } from "@/components/views/console-ui";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { money, ORDER_STATUSES, STATUS_LABEL, nextStatuses } from "@/lib/commerce";
import type { CommerceSettings, OrderRecord, OrderStatus } from "@/lib/types";

interface Summary {
  orders: number; open: number; delivered: number; cancelled: number; earned: number; pending: number;
}

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-800 border-amber-200",
  CONFIRMED: "bg-sky-100 text-sky-800 border-sky-200",
  PACKED: "bg-indigo-100 text-indigo-800 border-indigo-200",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-800 border-purple-200",
  DELIVERED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function OrdersTab() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<OrderRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: "100" });
      if (status !== "ALL") params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const data = await api.get<{ orders: OrderRecord[]; summary: Summary; settings: CommerceSettings }>(
        `/api/orders?${params.toString()}`,
      );
      setOrders(data.orders);
      setSummary(data.summary);
      setSettings(data.settings);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function move(order: OrderRecord, to: OrderStatus) {
    setBusy(true);
    try {
      const data = await api.patch<{ order: OrderRecord }>(`/api/orders/${order.id}`, { status: to });
      setOrders((rows) => rows.map((row) => (row.id === order.id ? data.order : row)));
      setOpen(data.order);
      toast({ title: `Order ${order.number} — ${STATUS_LABEL[to]}`, description: "The customer sees this on the tracking page." });
      void load();
    } catch (e) {
      toast({ title: "Could not update the order", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(order: OrderRecord) {
    setBusy(true);
    try {
      const data = await api.patch<{ order: OrderRecord }>(`/api/orders/${order.id}`, { paymentStatus: "PAID" });
      setOrders((rows) => rows.map((row) => (row.id === order.id ? data.order : row)));
      setOpen(data.order);
      toast({ title: `Order ${order.number} marked paid` });
      void load();
    } catch (e) {
      toast({ title: "Could not update the payment", description: errMsg(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(order: OrderRecord, ownerNotes: string) {
    try {
      const data = await api.patch<{ order: OrderRecord }>(`/api/orders/${order.id}`, { ownerNotes });
      setOrders((rows) => rows.map((row) => (row.id === order.id ? data.order : row)));
      setOpen(data.order);
    } catch (e) {
      toast({ title: "Could not save the note", description: errMsg(e), variant: "destructive" });
    }
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const order of orders) map[order.status] = (map[order.status] ?? 0) + 1;
    return map;
  }, [orders]);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Everything ordered on your website, and what still needs doing about it."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowSettings((v) => !v)}>
              <Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Shop settings
            </Button>
            {/* A plain link, so the browser handles the download and the CSV is
                never built into this page's memory. */}
            <a
              href={`/api/orders/export${status !== "ALL" ? `?status=${status}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </a>
            <Button variant="outline" className="rounded-xl" onClick={() => void load()}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Refresh
            </Button>
          </div>
        }
      />

      {showSettings && settings && (
        <ShopSettings
          settings={settings}
          onSaved={(saved) => {
            setSettings(saved);
            toast({ title: saved.enabled ? "Your shop is live" : "Online orders are off" });
          }}
        />
      )}

      {/* The numbers a shopkeeper reads first: what came in, what is outstanding,
          and how much has actually been delivered (not merely ordered). */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Orders", value: summary ? String(summary.orders) : "—", hint: "all time" },
          { label: "Open", value: summary ? String(summary.open) : "—", hint: "need action" },
          { label: "Delivered", value: summary ? String(summary.delivered) : "—", hint: "completed" },
          { label: "Earned", value: summary ? money(summary.earned) : "—", hint: "delivered value" },
        ].map((card) => (
          <Card key={card.label} className="rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {["ALL", "OPEN", ...ORDER_STATUSES].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  status === value ? "border-zinc-900 bg-zinc-900 text-white" : "hover:bg-zinc-50"
                }`}
              >
                {value === "ALL" ? "All" : value === "OPEN" ? "Open" : STATUS_LABEL[value as OrderStatus]}
                {value !== "ALL" && value !== "OPEN" && counts[value] ? ` ${counts[value]}` : ""}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Input
              className="h-9 w-48 rounded-xl"
              placeholder="Order no. or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={status === "ALL" ? "No orders yet" : "Nothing in this view"}
            hint={
              status === "ALL"
                ? settings?.enabled
                  ? "Share your website — the cart is live and any order lands here."
                  : "Turn on online orders in Shop settings, and the products you have priced will be buyable on your site."
                : "Try another filter, or clear the search box."
            }
          />
        ) : (
          <ul className="divide-y">
            {orders.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setOpen(order)}
                  className="flex w-full flex-wrap items-center gap-3 py-3 text-left transition hover:bg-zinc-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{order.number}</span>
                      <Badge variant="outline" className={STATUS_STYLE[order.status] ?? ""}>
                        {STATUS_LABEL[order.status as OrderStatus] ?? order.status}
                      </Badge>
                      {order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                          {order.payment === "COD" ? "Cash on delivery" : "UPI — not marked paid"}
                        </Badge>
                      )}
                      {order.fulfilment === "PICKUP" && <Badge variant="outline">Collect</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {order.customerName} · {order.phone} · {order.items.map((i) => `${i.qty}×${i.name}`).join(", ")}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{money(order.total)}</span>
                    <span className="block text-xs text-muted-foreground">{when(order.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <OrderDetail
          order={open}
          busy={busy}
          onClose={() => setOpen(null)}
          onMove={(to) => void move(open, to)}
          onPaid={() => void markPaid(open)}
          onNote={(notes) => void saveNote(open, notes)}
        />
      )}
    </div>
  );
}

/** One order, with the moves that are legal right now. */
function OrderDetail({
  order, busy, onClose, onMove, onPaid, onNote,
}: {
  order: OrderRecord;
  busy: boolean;
  onClose: () => void;
  onMove: (to: OrderStatus) => void;
  onPaid: () => void;
  onNote: (notes: string) => void;
}) {
  const [note, setNote] = useState(order.ownerNotes);
  const moves = nextStatuses(order.status);
  const wa = order.phone.replace(/\D/g, "");
  const waHref = wa
    ? `https://wa.me/${wa.length === 10 ? `91${wa}` : wa}?text=${encodeURIComponent(`Hello ${order.customerName}, about your order ${order.number}…`)}`
    : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Order ${order.number}`}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-bold">{order.number}</h2>
            <p className="text-xs text-muted-foreground">{when(order.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${order.phone}`} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium">
              <Phone className="h-4 w-4" aria-hidden="true" /> {order.phone}
            </a>
            {waHref && (
              <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-[#25d366] px-3 py-1.5 text-sm font-semibold text-white">
                WhatsApp {order.customerName.split(" ")[0]}
              </a>
            )}
          </div>

          <ul className="mt-4 space-y-1 rounded-xl bg-zinc-50 p-3 text-sm">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.name}`} className="flex justify-between gap-3">
                <span>{item.qty} × {item.name}</span>
                <span>{money(item.price * item.qty)}</span>
              </li>
            ))}
            {order.delivery > 0 && (
              <li className="flex justify-between gap-3 text-muted-foreground">
                <span>Delivery</span><span>{money(order.delivery)}</span>
              </li>
            )}
            <li className="flex justify-between border-t pt-1 font-bold">
              <span>Total</span><span>{money(order.total)}</span>
            </li>
          </ul>

          <div className="mt-4 space-y-2 text-sm">
            <p className="flex items-start gap-2">
              {order.fulfilment === "PICKUP" ? <Package className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              <span>
                {order.fulfilment === "PICKUP" ? "Customer collects from the shop" : `Deliver to: ${order.address}`}
              </span>
            </p>
            {order.address && order.fulfilment === "DELIVERY" && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(order.address)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 underline underline-offset-2"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Open the address in Maps
              </a>
            )}
            {order.notes && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Customer: {order.notes}</p>
            )}
            {order.paymentRef && (
              <p className="text-xs text-muted-foreground">Payment reference from the customer: <span className="font-mono">{order.paymentRef}</span></p>
            )}
            <p className="text-xs text-muted-foreground">
              Payment: {order.payment === "COD" ? "Cash on delivery" : "UPI"} · {order.paymentStatus === "PAID" ? "marked paid" : "not marked paid"}
            </p>
          </div>

          <div className="mt-5">
            <Label className="text-xs">Your note about this order</Label>
            <Textarea
              className="mt-1 rounded-xl text-sm"
              rows={2}
              value={note}
              placeholder="e.g. Called, will collect on Sunday"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== order.ownerNotes && onNote(note)}
            />
          </div>
        </div>

        <div className="border-t px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">What next</p>
          <div className="flex flex-wrap gap-2">
            {moves.map((to) => (
              <Button
                key={to}
                disabled={busy}
                variant={to === "CANCELLED" ? "outline" : "default"}
                className={`rounded-xl ${to === "CANCELLED" ? "text-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                onClick={() => onMove(to)}
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Mark {STATUS_LABEL[to].toLowerCase()}
              </Button>
            ))}
            {order.paymentStatus !== "PAID" && order.status !== "CANCELLED" && (
              <Button variant="outline" className="rounded-xl" disabled={busy} onClick={onPaid}>
                Payment received
              </Button>
            )}
            {!moves.length && order.status === "CANCELLED" && (
              <p className="text-sm text-muted-foreground">This order was cancelled. Nothing more to do.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The shop's rules: delivery charge, minimum, pickup and cash on delivery. */
function ShopSettings({ settings, onSaved }: { settings: CommerceSettings; onSaved: (s: CommerceSettings) => void }) {
  const [form, setForm] = useState({
    enabled: settings.enabled,
    deliveryCharge: String(settings.deliveryCharge || ""),
    freeDeliveryAbove: String(settings.freeDeliveryAbove || ""),
    minOrder: String(settings.minOrder || ""),
    pickup: settings.pickup,
    cod: settings.cod,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const data = await api.put<{ settings: CommerceSettings }>("/api/orders/settings", {
        enabled: form.enabled,
        deliveryCharge: Number(form.deliveryCharge || 0),
        freeDeliveryAbove: Number(form.freeDeliveryAbove || 0),
        minOrder: Number(form.minOrder || 0),
        pickup: form.pickup,
        cod: form.cod,
      });
      onSaved(data.settings);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Shop settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These rules are what your website shows at checkout — the delivery charge is never a surprise at the last step.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="shop-on" className="text-sm font-medium">Take orders online</Label>
          <Switch id="shop-on" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Delivery charge (₹)</Label>
          <Input className="mt-1 rounded-xl" inputMode="numeric" placeholder="0"
            value={form.deliveryCharge} onChange={(e) => setForm({ ...form, deliveryCharge: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Free delivery above (₹)</Label>
          <Input className="mt-1 rounded-xl" inputMode="numeric" placeholder="Leave blank for never"
            value={form.freeDeliveryAbove} onChange={(e) => setForm({ ...form, freeDeliveryAbove: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Minimum order (₹)</Label>
          <Input className="mt-1 rounded-xl" inputMode="numeric" placeholder="0"
            value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.pickup} onCheckedChange={(v) => setForm({ ...form, pickup: v })} />
          Customers can collect from the shop
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={form.cod} onCheckedChange={(v) => setForm({ ...form, cod: v })} />
          Cash on delivery
        </label>
      </div>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save shop settings"}
        </Button>
        <a href="/dashboard/products" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 underline underline-offset-2">
          Manage products <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </Card>
  );
}
