"use client";
// Scroll-reveal for tenant sites, for browsers without scroll-driven CSS
// animations (Safari, Firefox today).
//
// The CSS only hides a .ws-reveal element once <html> carries .ws-js, which
// this component adds. So if the script is blocked, fails, or never hydrates,
// nothing is ever hidden and the site renders exactly as it does today.

import { useEffect } from "react";

export default function SiteReveal() {
  useEffect(() => {
    const root = document.documentElement;
    const supported = CSS.supports("animation-timeline: view()");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (supported || reduced || !("IntersectionObserver" in window)) return;

    root.classList.add("ws-js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of document.querySelectorAll(".ws-reveal")) {
        if (seen.has(el)) continue;
        seen.add(el);
        io.observe(el);
      }
    };
    scan();

    // Sections render as content loads, so watch for ones added later.
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      io.disconnect();
      root.classList.remove("ws-js");
    };
  }, []);

  return null;
}
