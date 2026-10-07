"use client";
// WebSetu — the freeform visual editor.
//
// The dashboard's Builder tab is a form: pick a section, fill its fields, save.
// This is the other half of that — the page itself is the canvas. Click any
// section on the real, rendered site to select it; drag the outline to reorder;
// set a background, a padding rhythm, a column count on the section you are
// looking at; add or drop sections; undo anything. Live on the left, controls on
// the right, and what you see is exactly the markup that gets published because
// it is the same SiteRenderer.
//
// Everything goes through lib/editor.ts, which is pure: the state transitions
// are testable without a browser, and the undo stack is a list of documents
// rather than a list of patches that could drift.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Copy, Eye, EyeOff, GripVertical, ImageIcon, Monitor, Plus, Redo2, Rocket,
  Save, Smartphone, Tablet, Trash2, Undo2, X,
} from "lucide-react";
import SiteRenderer from "@/components/site/site-renderer";
import type { Device } from "@/components/site/site-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { errMsg } from "@/components/views/console-ui";
import { useToast } from "@/hooks/use-toast";
import { SECTION_LIBRARY } from "@/lib/sections";
import { SECTION_FIELDS, type FieldDef } from "@/lib/section-fields";
import {
  ALIGN_CHOICES, BG_CHOICES, COL_CHOICES, HEAD_CHOICES, PAD_CHOICES,
  readSectionStyle,
} from "@/lib/section-style";
import {
  addItem, addSection, docSignature, duplicateSection, EditorHistory, moveItem, moveSection,
  moveSectionBefore, removeItem, removeSection, setField, setItem, setStyle, summarizeChanges,
  toggleVisible, typeLabel, type EditorDoc,
} from "@/lib/editor";
import type { SectionType, SitePayload } from "@/lib/types";

const DEVICES: { value: Device; label: string; icon: typeof Monitor }[] = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "mobile", label: "Phone", icon: Smartphone },
];

const isTyping = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  const tag = node?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node?.isContentEditable === true;
};

export default function VisualEditor({ slug }: { slug: string }) {
  const { toast } = useToast();

  const [payload, setPayload] = useState<SitePayload | null>(null);
  const [doc, setDoc] = useState<EditorDoc | null>(null);
  const history = useRef<EditorHistory | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState("");
  const [addType, setAddType] = useState<SectionType>("services");
  const [dragId, setDragId] = useState<string | null>(null);
  const [, forcePaint] = useState(0);

  const refresh = useCallback(() => forcePaint((n) => n + 1), []);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    api
      .get<SitePayload>(`/api/site/${slug}`)
      .then((data) => {
        if (!alive) return;
        const initial: EditorDoc = { sections: (data.website?.sections ?? []).map((s) => ({ ...s, content: { ...s.content } })) };
        history.current = new EditorHistory(initial);
        setPayload(data);
        setDoc(initial);
        setSaved(docSignature(initial));
        if (initial.sections[0]) setSelectedId(initial.sections[0].id);
      })
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [slug]);

  const section = useMemo(
    () => doc?.sections.find((s) => s.id === selectedId) ?? null,
    [doc, selectedId],
  );

  const dirty = Boolean(doc && saved && docSignature(doc) !== saved);

  /** Every edit lands here: history first, then the document on screen. */
  const apply = useCallback(
    (next: EditorDoc, label: string, coalesceKey = "") => {
      const h = history.current;
      if (!h) return;
      if (coalesceKey) h.pushCoalesced(next, label, coalesceKey);
      else h.push(next, label);
      setDoc(h.current);
      refresh();
    },
    [refresh],
  );

  const undo = useCallback(() => {
    const h = history.current;
    if (!h) return;
    setDoc(h.undo());
    refresh();
  }, [refresh]);

  const redo = useCallback(() => {
    const h = history.current;
    if (!h) return;
    setDoc(h.redo());
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "Escape" && !isTyping(e.target)) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, doc]);

  async function save() {
    if (!doc) return;
    setSaving(true);
    try {
      await api.put("/api/website", { sections: doc.sections });
      setSaved(docSignature(doc));
      history.current?.markSaved();
      refresh();
      toast({ title: "Draft saved", description: "Publish when you are ready for the world to see it." });
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!doc) return;
    setPublishing(true);
    try {
      // Save first: publishing a version the owner cannot see afterwards is the
      // one thing a publish button must never do.
      await api.put("/api/website", { sections: doc.sections });
      await api.post("/api/website/publish", {});
      setSaved(docSignature(doc));
      history.current?.markSaved();
      refresh();
      toast({ title: "Website published", description: "Your changes are live." });
    } catch (e) {
      toast({ title: "Could not publish", description: errMsg(e), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  const changes = useMemo(() => {
    const h = history.current;
    if (!h || !doc) return [];
    return summarizeChanges(h.current, doc);
  }, [doc]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Card className="rounded-2xl p-6 text-sm text-muted-foreground">{error}</Card>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-emerald-700 underline">Back to dashboard</Link>
      </div>
    );
  }

  if (!doc || !payload) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-[70vh] w-full rounded-2xl" />
      </div>
    );
  }

  const previewPayload: SitePayload = {
    ...payload,
    website: { ...payload.website, sections: doc.sections },
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      {/* ---------- toolbar ---------- */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <Link href="/dashboard/builder" className="flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Builder
        </Link>
        <span className="hidden text-sm font-semibold text-zinc-900 sm:inline">Visual editor</span>
        {dirty && <Badge variant="secondary" className="bg-amber-100 text-amber-800">Unsaved changes</Badge>}

        <div className="ml-auto flex items-center gap-1 rounded-xl border p-1">
          {DEVICES.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => setDevice(d.value)}
              aria-pressed={device === d.value}
              title={d.label}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                device === d.value ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <d.icon className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={undo} disabled={!history.current?.canUndo}>
            <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Undo
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={redo} disabled={!history.current?.canRedo}>
            <Redo2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Redo
          </Button>
        </div>

        <Button variant="outline" size="sm" className="rounded-xl" onClick={save} disabled={saving || !dirty}>
          <Save className="mr-1.5 h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={publish} disabled={publishing}>
          <Rocket className="mr-1.5 h-4 w-4" aria-hidden="true" /> {publishing ? "Publishing…" : "Publish"}
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        {/* ---------- outline ---------- */}
        <aside className="w-full shrink-0 lg:w-72">
          <Card className="rounded-2xl p-3">
            <p className="px-1 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Page</p>
            <ul className="space-y-1">
              {doc.sections.map((s, i) => (
                <li
                  key={s.id}
                  draggable
                  onDragStart={() => setDragId(s.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== s.id) apply(moveSectionBefore(doc, dragId, s.id), "Reordered sections");
                    setDragId(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-sm ${
                    selectedId === s.id ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:bg-zinc-50"
                  } ${dragId === s.id ? "opacity-50" : ""} ${s.visible === false ? "text-zinc-400" : ""}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-400" aria-hidden="true" />
                  <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelectedId(s.id)}>
                    {typeLabel(s.type)}
                  </button>
                  <button
                    type="button"
                    title={s.visible === false ? "Show this section" : "Hide this section"}
                    onClick={() => apply(toggleVisible(doc, s.id), s.visible === false ? "Shown section" : "Hidden section")}
                    className="rounded p-1 text-zinc-400 hover:bg-white hover:text-zinc-700"
                  >
                    {s.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex flex-col">
                    <button type="button" title="Move up" disabled={i === 0}
                      onClick={() => apply(moveSection(doc, s.id, i - 1), "Moved section up")}
                      className="rounded px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30">
                      <ChevronGlyph up />
                    </button>
                    <button type="button" title="Move down" disabled={i === doc.sections.length - 1}
                      onClick={() => apply(moveSection(doc, s.id, i + 1), "Moved section down")}
                      className="rounded px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30">
                      <ChevronGlyph />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <select
                className="min-w-0 flex-1 rounded-xl border border-input bg-white px-2 py-1.5 text-sm"
                value={addType}
                onChange={(e) => setAddType(e.target.value as SectionType)}
                aria-label="Section to add"
              >
                {SECTION_LIBRARY.map((s) => (
                  <option key={s.type} value={s.type}>{s.name}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => {
                const next = addSection(doc, addType, selectedId ?? undefined);
                const added = next.sections.find((s) => !doc.sections.some((o) => o.id === s.id));
                apply(next, "Added section");
                if (added) setSelectedId(added.id);
              }}>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </Card>

          {changes.length > 0 && (
            <Card className="mt-3 rounded-2xl p-3">
              <p className="px-1 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Since you opened</p>
              <ul className="space-y-1 px-1 text-xs text-zinc-600">
                {changes.slice(0, 12).map((line) => <li key={line}>· {line}</li>)}
              </ul>
            </Card>
          )}
        </aside>

        {/* ---------- canvas ---------- */}
        <main className="min-w-0 flex-1">
          <div
            className="mx-auto overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200"
            onClick={(e) => {
              // A click on the page background clears the selection, so there is
              // always a way out of a selected section without a keyboard.
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
          >
            <SiteRenderer
              payload={previewPayload}
              mode="preview"
              device={device}
              editing
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </main>

        {/* ---------- inspector ---------- */}
        <aside className="w-full shrink-0 lg:w-96">
          {!section ? (
            <Card className="rounded-2xl p-6 text-sm text-muted-foreground">
              Click a section on the page — or in the list — to change it.
            </Card>
          ) : (
            <Card className="rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{typeLabel(section.type)}</p>
                <div className="flex items-center gap-1">
                  <button type="button" title="Duplicate" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
                    onClick={() => apply(duplicateSection(doc, section.id), "Duplicated section")}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button type="button" title="Delete" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      apply(removeSection(doc, section.id), "Removed section");
                      setSelectedId(null);
                    }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {SECTION_FIELDS[section.type].map((field) => (
                  <FieldEditor
                    key={field.key}
                    field={field}
                    section={section}
                    onChange={(value, coalesce) => {
                      if (coalesce) apply(setField(doc, section.id, field.key, value), `${field.label} edited`, `${section.id}:${field.key}`);
                      else apply(setField(doc, section.id, field.key, value), `${field.label} edited`);
                    }}
                    onItem={(index, itemKey, value) =>
                      apply(
                        setItem(doc, section.id, field.key, index, itemKey, value),
                        `${field.label} edited`,
                        `${section.id}:${field.key}:${index}:${itemKey}`,
                      )}
                    onAddItem={() => apply(addItem(doc, section.id, field.key, field.maxItems ?? 12), `Added ${field.label.toLowerCase()}`)}
                    onRemoveItem={(index) => apply(removeItem(doc, section.id, field.key, index), `Removed a row`)}
                    onMoveItem={(from, to) => apply(moveItem(doc, section.id, field.key, from, to), "Reordered rows")}
                  />
                ))}
              </div>

              <div className="mt-5 border-t pt-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Style</p>
                <div className="grid grid-cols-2 gap-3">
                  <StyleSelect label="Background" value={readSectionStyle(section).bg ?? "inherit"}
                    choices={BG_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
                    onChange={(v) => apply(setStyle(doc, section.id, "bg", v), "Section background")} />
                  <StyleSelect label="Spacing" value={readSectionStyle(section).pad ?? "normal"}
                    choices={PAD_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
                    onChange={(v) => apply(setStyle(doc, section.id, "pad", v), "Section spacing")} />
                  <StyleSelect label="Heading size" value={readSectionStyle(section).head ?? ""}
                    choices={[{ value: "", label: "Default" }, ...HEAD_CHOICES.map((c) => ({ value: c.value, label: c.label }))]}
                    onChange={(v) => apply(setStyle(doc, section.id, "head", v || undefined), "Heading size")} />
                  <StyleSelect label="Text" value={readSectionStyle(section).align ?? "left"}
                    choices={ALIGN_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
                    onChange={(v) => apply(setStyle(doc, section.id, "align", v), "Text alignment")} />
                  <StyleSelect label="Columns" value={readSectionStyle(section).cols ? String(readSectionStyle(section).cols) : ""}
                    choices={[{ value: "", label: "Automatic" }, ...COL_CHOICES.map((c) => ({ value: String(c.value), label: c.label }))]}
                    onChange={(v) => apply(setStyle(doc, section.id, "cols", v ? Number(v) : undefined), "Column count")} />
                  <div>
                    <Label className="text-xs">On phones</Label>
                    <Button variant="outline" size="sm" className="mt-1 w-full rounded-xl"
                      onClick={() => apply(setStyle(doc, section.id, "hideMobile", !readSectionStyle(section).hideMobile), "Phone visibility")}>
                      {readSectionStyle(section).hideMobile ? "Hidden" : "Shown"}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Style is stored with the section, so it survives regeneration: regenerate the words and the look you set stays.
                </p>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function ChevronGlyph({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`h-3 w-3 ${up ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StyleSelect({ label, value, choices, onChange }: {
  label: string; value: string; choices: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="mt-1 w-full rounded-xl border border-input bg-white px-2 py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    </div>
  );
}

/** One field of the selected section: text, paragraph, photo, layout, or rows. */
function FieldEditor({
  field, section, onChange, onItem, onAddItem, onRemoveItem, onMoveItem,
}: {
  field: FieldDef;
  section: { id: string; content: Record<string, unknown> };
  onChange: (value: unknown, coalesce?: boolean) => void;
  onItem: (index: number, key: string, value: string) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (from: number, to: number) => void;
}) {
  const raw = section.content?.[field.key];
  const value = typeof raw === "string" ? raw : "";

  if (field.kind === "items") {
    const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    return (
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{field.label}</Label>
          <button type="button" className="text-xs font-medium text-emerald-700 hover:underline" onClick={onAddItem}>
            + Add row
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              No rows yet — the section stays hidden until it has one.
            </p>
          )}
          {rows.map((row, i) => (
            <div key={i} className="rounded-xl border p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-400">#{i + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" title="Move up" disabled={i === 0} onClick={() => onMoveItem(i, i - 1)}
                    className="rounded px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ChevronGlyph up /></button>
                  <button type="button" title="Move down" disabled={i === rows.length - 1} onClick={() => onMoveItem(i, i + 1)}
                    className="rounded px-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"><ChevronGlyph /></button>
                  <button type="button" title="Remove" onClick={() => onRemoveItem(i)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {field.itemFields?.map((sub) => {
                const subValue = typeof row[sub.key] === "string" ? (row[sub.key] as string) : "";
                return sub.kind === "textarea" ? (
                  <Textarea key={sub.key} className="mb-1 rounded-lg text-sm" rows={2} placeholder={sub.placeholder ?? sub.label}
                    value={subValue} onChange={(e) => onItem(i, sub.key, e.target.value)} />
                ) : (
                  <Input key={sub.key} className="mb-1 rounded-lg text-sm" placeholder={sub.placeholder ?? sub.label}
                    value={subValue} onChange={(e) => onItem(i, sub.key, e.target.value)} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <StyleSelect
        label={field.label}
        value={value || (field.options?.[0]?.value ?? "")}
        choices={field.options ?? []}
        onChange={(v) => onChange(v)}
      />
    );
  }

  if (field.kind === "textarea") {
    return (
      <div>
        <Label className="text-xs">{field.label}</Label>
        <Textarea
          className="mt-1 rounded-xl text-sm"
          rows={3}
          maxLength={field.max}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value, true)}
        />
      </div>
    );
  }

  if (field.kind === "image") {
    return (
      <div>
        <Label className="text-xs">{field.label}</Label>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-zinc-50">
            {value ? (
              <img src={value} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            )}
          </span>
          <Input className="rounded-xl text-sm" placeholder="https://…" maxLength={field.max}
            value={value} onChange={(e) => onChange(e.target.value, true)} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label className="text-xs">{field.label}</Label>
      <Input
        className="mt-1 rounded-xl text-sm"
        maxLength={field.max}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value, true)}
      />
    </div>
  );
}
