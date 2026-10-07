"use client";
// WebSetu — the two chart families, in their own module on purpose.
//
// recharts is the single largest client dependency in the app (its bundle is
// roughly a quarter of a megabyte before gzip) and it was imported at the top of
// dashboard-view.tsx and admin-view.tsx. Because those two files are the whole
// console, every visit to /dashboard/leads, /dashboard/builder or /admin/plans
// downloaded the entire charting library to render an inbox or a form.
//
// Nothing here is imported directly. Both call sites pull these through
// `next/dynamic`, so the library is fetched only when a screen that actually
// draws a chart is opened, and never on the server.
//
// Presentation only: no fetching, no business rules, no formatting decisions
// that belong to the caller (currency formatting arrives as a prop).

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/**
 * The exact hex values the charts draw with.
 *
 * The legends next to these charts are plain Tailwind (`bg-emerald-600`,
 * `bg-amber-600`), which resolve to the same two colours — that is why the
 * legend lives in the caller and the palette lives here.
 */
const C = { emerald: "#059669", amber: "#d97706" } as const;

const AXIS = { fontSize: 11, fill: "#71717a" } as const;
const TOOLTIP_STYLE = { borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 } as const;

export interface DailyPoint {
  /** Short, human date ("7 Oct") — the caller builds it so this stays locale-free. */
  label: string;
  visits: number;
  leads: number;
}

/** Visits and enquiries per day. Used by the customer's Analytics tab. */
export function DailyTrafficChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="gVisits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.emerald} stopOpacity={0.25} />
            <stop offset="100%" stopColor={C.emerald} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.amber} stopOpacity={0.25} />
            <stop offset="100%" stopColor={C.amber} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ fontWeight: 700, color: "#18181b" }} />
        <Area type="monotone" dataKey="visits" stroke={C.emerald} strokeWidth={2} fill="url(#gVisits)" name="Visits" />
        <Area type="monotone" dataKey="leads" stroke={C.amber} strokeWidth={2} fill="url(#gLeads)" name="Leads" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface CtaPoint {
  name: string;
  count: number;
}

/** Which call-to-action buttons visitors press. Customer's Analytics tab. */
export function CtaClicksChart({ data }: { data: CtaPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(5,150,105,0.06)" }} />
        <Bar dataKey="count" name="Clicks" fill={C.emerald} radius={[6, 6, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface RevenuePoint {
  label: string;
  amount: number;
}

/**
 * The revenue sparkline under the admin's revenue total.
 *
 * `format` is a prop rather than an import so the currency helper stays where
 * the rest of the console's formatting lives; passing a function is only
 * possible because these are ordinary client components, not server ones.
 */
export function RevenueSparkline({ data, format }: { data: RevenuePoint[]; format: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <XAxis dataKey="label" hide />
        <YAxis hide />
        <Tooltip formatter={(v) => format(Number(v))} contentStyle={{ borderRadius: 10, borderColor: "#e4e4e7", fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="amount"
          stroke={C.emerald}
          strokeWidth={2.5}
          dot={{ r: 2.5, fill: C.emerald, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
