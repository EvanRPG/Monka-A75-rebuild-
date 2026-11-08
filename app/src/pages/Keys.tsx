import { useEffect, useMemo, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { Section, Segmented, Workspace } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_FN_MATRIX, KEYS, defaultMatrix, entryAt, type Entry, type KeyCap } from "@/lib/a75";
import { api } from "@/lib/backend";
import { GROUPS, capText, describe, sameEntry, type KeyFn } from "@/lib/keys";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RotateCcw, Search } from "lucide-react";

type Layer = "base" | "fn";

const MACRO_ITEMS: KeyFn[] = Array.from({ length: 8 }, (_, i) => ({
  label: `宏 ${i + 1}`,
  cap: `M${i + 1}`,
  entry: [9, 0, i, 0],
}));

export default function Keys() {
  const [layer, setLayer] = useState<Layer>("base");
  const [maps, setMaps] = useState<{ base: number[]; fn: number[] } | null>(null);
  const [sel, setSel] = useState<KeyCap | null>(KEYS.find((k) => k.name === "Caps") ?? null);
  const [group, setGroup] = useState("letters");
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([api.readKeymap(0), api.readFnKeymap(0)])
      .then(([base, fn]) => setMaps({ base, fn }))
      .catch((e) => toast.error(`读取按键失败：${e}`));
  }, []);

  const defaults = layer === "base" ? defaultMatrix() : DEFAULT_FN_MATRIX;
  const matrix = maps ? maps[layer] : null;

  const badges = useMemo(() => {
    const out: Record<number, string> = {};
    if (!matrix) return out;
    for (const k of KEYS) {
      const e = entryAt(matrix, k.slot);
      if (layer === "fn") {
        if (!e.every((b) => b === 0)) out[k.slot] = capText(e, true);
      } else if (!sameEntry(e, entryAt(defaults, k.slot))) out[k.slot] = capText(e);
    }
    return out;
  }, [matrix, layer, defaults]);

  const current: Entry | null = matrix && sel ? entryAt(matrix, sel.slot) : null;
  const original: Entry | null = sel ? entryAt(defaults, sel.slot) : null;

  const assign = async (f: KeyFn) => {
    if (!sel || !maps) return;
    const fnLayer = layer === "fn";
    try {
      const ok = await api.setKey(0, sel.slot, f.entry, fnLayer);
      if (!ok) throw new Error("键盘回读不一致");
      setMaps((m) => {
        if (!m) return m;
        const next = [...m[layer]];
        f.entry.forEach((b, i) => (next[sel.slot * 4 + i] = b));
        return { ...m, [layer]: next };
      });
      toast.success(`${sel.name} → ${f.label}`);
    } catch (e) {
      toast.error(`写入失败：${e}`);
    }
  };

  const groups = [...GROUPS.slice(0, -1), { id: "macro", name: "宏", items: MACRO_ITEMS }, GROUPS[GROUPS.length - 1]];
  const items = query.trim()
    ? groups.flatMap((g) => g.items).filter((f) => (f.label + (f.cap ?? "")).toLowerCase().includes(query.trim().toLowerCase()))
    : groups.find((g) => g.id === group)?.items ?? [];

  return (
    <Workspace
      stage={
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              id="keys-layer"
              value={layer}
              options={[
                ["base", "基础层"],
                ["fn", "Fn 层"],
              ]}
              onChange={setLayer}
            />
            <span className="text-xs text-muted-foreground">
              {layer === "base" ? "蓝色标签是改过的键" : "Fn 层：按住 Fn 再按键时的功能。空着的键跟随基础层"}
            </span>
          </div>
          <Keyboard selected={sel ? [sel.slot] : []} onKey={(k) => setSel(k)} badges={badges} />
        </div>
      }
      below={
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative mr-auto">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="keys-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索功能，例如 音量、F13"
                className="h-8 w-56 pl-8 text-[13px]"
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-col sm:flex-row">
            {!query && (
              <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroup(g.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap",
                      g.id === group ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </nav>
            )}
            <div className="grid flex-1 auto-rows-[40px] grid-cols-[repeat(auto-fill,minmax(84px,1fr))] content-start gap-1.5 p-3">
              {items.map((f) => {
                const on = current ? sameEntry(current, f.entry) : false;
                return (
                  <button
                    key={f.label + f.entry.join(",")}
                    type="button"
                    disabled={!sel}
                    onClick={() => assign(f)}
                    title={f.label}
                    className={cn(
                      "truncate rounded-md border px-2 text-[13px] transition-colors",
                      on ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background hover:border-input hover:bg-accent",
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
              {items.length === 0 && <p className="col-span-full py-6 text-center text-[13px] text-muted-foreground">没有匹配的功能</p>}
            </div>
          </div>
        </div>
      }
      panel={
        sel ? (
          <>
            <div className="px-5 pt-5 pb-4">
              <div className="text-xs text-muted-foreground">{layer === "base" ? "基础层" : "Fn 层"} · 选中的键</div>
              <div className="mt-1 text-lg font-semibold">{sel.name}</div>
            </div>
            <Section title="当前功能">
              <div className="rounded-md border border-border bg-muted px-3 py-2.5 text-[15px] font-medium">
                {current ? describe(current, layer === "fn") : "读取中…"}
              </div>
              {current && original && !sameEntry(current, original) && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>出厂：{describe(original, layer === "fn")}</span>
                  <Button variant="ghost" size="xs" onClick={() => assign({ label: describe(original, layer === "fn"), entry: original })}>
                    <RotateCcw />
                    还原
                  </Button>
                </div>
              )}
            </Section>
            <Section title="怎么改">
              <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[13px] text-muted-foreground">
                <li>在键盘图上点要改的键，旋钮的左转、右转、按下也可以点。</li>
                <li>在下方选一个新功能，点一下就写入键盘。</li>
                <li>想恢复，点上面的「还原」。</li>
              </ol>
            </Section>
            {sel.slot === 59 && layer === "base" && (
              <Section title="提醒">
                <p className="text-xs leading-relaxed text-warn">这是 Fn 键。把它改掉以后，所有 Fn 组合键都会失效。</p>
              </Section>
            )}
          </>
        ) : (
          <div className="p-5 text-[13px] text-muted-foreground">在键盘图上点一个键开始。</div>
        )
      }
    />
  );
}
