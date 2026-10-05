"use client";
// WebSetu — where you are in the console.
//
// Only worth having now that sections are real URLs: previously "Dashboard >
// Leads" would have pointed at a place the browser could not go, which is a
// decoration rather than navigation.
//
// Two levels, never more. The console is one level deep, and a trail that
// invents hierarchy to look thorough is worse than none.

import { ChevronRight } from "lucide-react";

export default function ConsoleBreadcrumb({
  root,
  rootHref,
  current,
}: {
  root: string;
  rootHref: string;
  current: string;
}) {
  // On the root section itself the trail would read "Dashboard > Overview",
  // which says nothing the page title does not.
  const atRoot = current.toLowerCase() === "overview";

  return (
    <nav aria-label="Breadcrumb" className="mb-3 hidden md:block">
      <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <li>
          {atRoot ? (
            <span aria-current="page" className="font-medium text-foreground">{root}</span>
          ) : (
            <a href={rootHref} className="transition hover:text-foreground">{root}</a>
          )}
        </li>
        {atRoot ? null : (
          <>
            <li aria-hidden="true">
              <ChevronRight className="h-3 w-3" />
            </li>
            <li>
              <span aria-current="page" className="font-medium text-foreground">{current}</span>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
