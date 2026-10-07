/**
 * Unit tests for the shop: cart maths, rules, order status, and what an order
 * book says about money.
 *
 *   node --experimental-strip-types --import ./tests/path-alias.mjs tests/commerce.test.mts
 *
 * Two of these functions decide money and one decides permission, so the tests
 * are mostly about refusals: a product that is not in the catalogue cannot be
 * bought, a price-less product cannot be bought, a delivered order cannot be
 * un-delivered by a stale tab, and a customer with the right order number and
 * the wrong phone learns nothing.
 */

import {
  DEFAULT_COMMERCE, canMove, checkoutProblems, effectivePrice, highestOrderNumber, isOpenOrder,
  isOrderStatus, itemsLine, money, nextOrderNumber, nextStatuses, orderItems, ordersCsv,
  priceCart, readCommerce, summarizeGroups, summarizeOrders, trackingMatches,
  type CheckoutRequest,
} from "@/lib/commerce";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const products = [
  { id: "p1", name: "Ceiling Fan", price: 1999 },
  { id: "p2", name: "LED Bulb", price: 200, salePrice: 149 },
  { id: "p3", name: "Quotation Only Item", price: null },
  { id: "p4", name: "Price on request", price: 5000, hidePrice: true },
  { id: "p5", name: "Free sample", price: 0 },
];

const shop = (over: Partial<typeof DEFAULT_COMMERCE> = {}) => ({ ...DEFAULT_COMMERCE, enabled: true, ...over });

// ---------- settings ----------
check("defaults are off", DEFAULT_COMMERCE.enabled === false);
check("defaults allow pickup and cash", DEFAULT_COMMERCE.pickup && DEFAULT_COMMERCE.cod);
const junkSettings = readCommerce('{"enabled":"yes","deliveryCharge":-50,"freeDeliveryAbove":"x","minOrder":null}');
check("a non-true enabled is off", junkSettings.enabled === false);
check("a negative charge is refused", junkSettings.deliveryCharge === 0);
check("unreadable money falls back", junkSettings.freeDeliveryAbove === 0 && junkSettings.minOrder === 0);
check("unreadable json falls back", readCommerce("not json").enabled === false);
check("missing json falls back", readCommerce(undefined).minOrder === 0);
const kept = readCommerce('{"enabled":true,"deliveryCharge":49,"freeDeliveryAbove":1500,"minOrder":300,"pickup":false,"cod":false}');
check("real values survive", kept.deliveryCharge === 49 && kept.freeDeliveryAbove === 1500 && kept.minOrder === 300);
check("false survives for pickup and cod", kept.pickup === false && kept.cod === false);

// ---------- pricing ----------
check("a sale price wins", effectivePrice(products[1]) === 149);
check("a list price is used when there is no sale", effectivePrice(products[0]) === 1999);
check("no price is zero", effectivePrice(products[2]) === 0);

const cart = priceCart(products, [{ productId: "p1", qty: 2 }, { productId: "p2", qty: 1 }], shop());
check("lines are priced from the catalogue", cart.subtotal === 1999 * 2 + 149, String(cart.subtotal));
check("the delivered total includes delivery", cart.total === cart.subtotal + cart.delivery);
check("a product not in the catalogue cannot be bought", priceCart(products, [{ productId: "ghost", qty: 1 }], shop()).lines.length === 0);
check("a hide-price product cannot be bought", priceCart(products, [{ productId: "p4", qty: 1 }], shop()).lines.length === 0);
check("a price-less product cannot be bought", priceCart(products, [{ productId: "p3", qty: 1 }], shop()).lines.length === 0);
check("a zero price cannot be bought", priceCart(products, [{ productId: "p5", qty: 1 }], shop()).lines.length === 0);
check("an empty cart totals zero", priceCart(products, [], shop()).total === 0);

const clamped = priceCart(products, [{ productId: "p1", qty: 9999 }], shop());
check("a silly quantity is clamped, not refused", clamped.lines[0].qty === 99);
const negative = priceCart(products, [{ productId: "p1", qty: -3 }], shop());
check("a negative quantity becomes one", negative.lines[0].qty === 1);
const duplicated = priceCart(products, [{ productId: "p1", qty: 1 }, { productId: "p1", qty: 1 }], shop());
check("the same product twice is two lines in a cart file — the server totals both", duplicated.lines.length === 2);

// ---------- delivery rules ----------
const charged = priceCart(products, [{ productId: "p1", qty: 1 }], shop({ deliveryCharge: 49 }));
check("a delivery charge is added", charged.delivery === 49 && charged.total === 1999 + 49);
const freeAbove = priceCart(products, [{ productId: "p1", qty: 1 }], shop({ deliveryCharge: 49, freeDeliveryAbove: 2000 }));
check("free delivery above a threshold", freeAbove.delivery === 49 && freeAbove.freeDeliveryShortfall === 1, String(freeAbove.freeDeliveryShortfall));
const reached = priceCart(products, [{ productId: "p1", qty: 2 }], shop({ deliveryCharge: 49, freeDeliveryAbove: 2000 }));
check("the threshold is reached", reached.delivery === 0 && reached.freeDeliveryShortfall === 0);
const pickedUp = priceCart(products, [{ productId: "p1", qty: 1 }], shop({ deliveryCharge: 49 }), "PICKUP");
check("collecting it yourself costs nothing", pickedUp.delivery === 0 && pickedUp.total === 1999);
const minimum = priceCart(products, [{ productId: "p2", qty: 1 }], shop({ minOrder: 500 }));
check("the shortfall to the minimum is reported", minimum.minOrderShortfall === 351, String(minimum.minOrderShortfall));

// ---------- checkout validation ----------
const good: CheckoutRequest = {
  customerName: "Ravi Sharma", phone: "+91 98000 11122", email: "", address: "12 FC Road, Pune",
  notes: "", fulfilment: "DELIVERY", payment: "COD", paymentRef: "", items: [{ productId: "p1", qty: 1 }],
};
const goodTotal = priceCart(products, good.items, shop());
check("a complete order has no problems", checkoutProblems(good, shop(), goodTotal).length === 0);
check("an empty cart is refused", checkoutProblems({ ...good, items: [] }, shop(), priceCart(products, [], shop())).length === 1);
check("a missing name is refused", checkoutProblems({ ...good, customerName: "  " }, shop(), goodTotal).some((p) => p.includes("name")));
check("a bad phone is refused", checkoutProblems({ ...good, phone: "12" }, shop(), goodTotal).some((p) => p.includes("phone")));
check("a bad email is refused", checkoutProblems({ ...good, email: "nope" }, shop(), goodTotal).some((p) => p.includes("email")));
check("delivery without an address is refused", checkoutProblems({ ...good, address: "" }, shop(), goodTotal).some((p) => p.includes("address")));
check("pickup without an address is fine", checkoutProblems({ ...good, address: "", fulfilment: "PICKUP" }, shop(), goodTotal).length === 0);
check("pickup is refused when the shop does not offer it", checkoutProblems({ ...good, fulfilment: "PICKUP" }, shop({ pickup: false }), goodTotal).length === 1);
check("cash on delivery is refused when switched off", checkoutProblems({ ...good, payment: "COD" }, shop({ cod: false }), goodTotal).length === 1);
check("the minimum-order message names the amount", checkoutProblems(good, shop({ minOrder: 5000 }), priceCart(products, good.items, shop({ minOrder: 5000 }))).some((p) => p.includes("Minimum order")));

// ---------- statuses ----------
check("a status is recognised", isOrderStatus("PACKED"));
check("nonsense is not a status", !isOrderStatus("SHIPPED"));
check("new orders can be confirmed", canMove("NEW", "CONFIRMED"));
check("new orders can be cancelled", canMove("NEW", "CANCELLED"));
check("new orders cannot be delivered directly", !canMove("NEW", "DELIVERED"));
check("packed orders can be handed over", canMove("PACKED", "DELIVERED"));
check("an unknown stored status still offers the first moves", nextStatuses("WEIRD").includes("CONFIRMED"));
check("a cancelled order cannot be revived by a stale tab", nextStatuses("CANCELLED").length === 0);
check("a delivered order can be re-opened as out for delivery", canMove("DELIVERED", "OUT_FOR_DELIVERY"));
check("a confirmed order can be packed", nextStatuses("CONFIRMED").includes("PACKED"));
check("open orders are open", isOpenOrder("CONFIRMED") && isOpenOrder("NEW"));
check("delivered and cancelled are closed", !isOpenOrder("DELIVERED") && !isOpenOrder("CANCELLED"));

// ---------- order numbers ----------
check("the first order starts at 1001", nextOrderNumber(null) === "ORD-1001");
check("the next number follows the highest", nextOrderNumber("ORD-1001") === "ORD-1002");
check("a gap in the sequence does not matter", nextOrderNumber("ORD-1042") === "ORD-1043");
check("highest wins by number, not by string", highestOrderNumber(["ORD-999", "ORD-1042", "ORD-1088"]) === "ORD-1088");
check("a missing number is handled", highestOrderNumber([]) === null);

// ---------- the order book ----------
const rows = [
  { status: "DELIVERED", total: 2000 },
  { status: "DELIVERED", total: 500 },
  { status: "NEW", total: 300 },
  { status: "CANCELLED", total: 9000 },
] as const;
const summary = summarizeOrders(rows);
check("orders are counted", summary.orders === 4);
check("earned counts only delivered", summary.earned === 2500, String(summary.earned));
check("pending holds the open value, excluding cancellations", summary.pending === 300, String(summary.pending));
check("open excludes delivered and cancelled", summary.open === 1);
check("cancelled is counted, not earned", summary.cancelled === 1);

const grouped = summarizeGroups([
  { status: "DELIVERED", count: 2, total: 2500 },
  { status: "NEW", count: 1, total: 300 },
  { status: "CANCELLED", count: 1, total: 9000 },
]);
check("rounded from groups, the numbers match the rows", grouped.earned === summary.earned && grouped.pending === summary.pending && grouped.orders === summary.orders);

const csv = ordersCsv([{
  id: "o1", number: "ORD-1001", customerName: 'Ravi "Bhai" Sharma', phone: "+91 98000 11122",
  status: "DELIVERED", payment: "COD", paymentStatus: "PAID", total: 2148, createdAt: "2026-10-07T09:00:00.000Z",
  itemsJson: JSON.stringify([{ productId: "p1", name: "Ceiling Fan", qty: 1, price: 1999 }, { productId: "p2", name: "LED Bulb", qty: 1, price: 149 }]),
}]);
const csvLines = csv.split("\n");
check("the CSV has a header and one row", csvLines.length === 2);
check("the header names the columns", csvLines[0].includes("Order") && csvLines[0].includes("Status"));
check("a quote inside a name is escaped, not dropped", csv.includes('""Bhai""'));
check("delivery is derived from the total, not invented", csvLines[1].includes('"0.00"'));
check("the date is a date", csvLines[1].includes("2026-10-07"));

check("order lines survive a round trip", orderItems(JSON.stringify([{ productId: "p", name: "Fan", qty: 2, price: 10 }]))[0].qty === 2);
check("malformed lines are dropped", orderItems('{"not":"an array"}').length === 0);
check("a broken blob is not a crash", orderItems("{oops").length === 0);
check("lines without a quantity are dropped", orderItems(JSON.stringify([{ name: "x", qty: 0 }])).length === 0);
check("items read as one line", itemsLine([{ productId: "p", name: "Fan", qty: 2, price: 10 }]) === "2 × Fan");

// ---------- tracking ----------
const order = { number: "ORD-1042", phone: "+91 98000 11122" };
check("the right number and phone open the order", trackingMatches(order, "ORD-1042", "9800011122"));
check("the right number with a wrong phone does not", !trackingMatches(order, "ORD-1042", "9999999999"));
check("a wrong number with the right phone does not", !trackingMatches(order, "ORD-1043", "9800011122"));
check("case does not matter", trackingMatches(order, "ord-1042", "9800011122"));
check("blank input opens nothing", !trackingMatches(order, "", "") && !trackingMatches(order, "ORD-1042", ""));
check("a short phone number opens nothing", !trackingMatches(order, "ORD-1042", "1122"));

// ---------- formatting ----------
check("money reads in rupees", money(1999) === "₹1,999");
check("money keeps paise only when there are any", money(149.5) === "₹149.5");

console.log(`\ncommerce: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
