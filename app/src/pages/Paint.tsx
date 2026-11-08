import { useMemo, useState } from "react";
import { Keyboard } from "@/components/Keyboard";
import { ColorSwatches, Section, Segmented, Workspace, Callout } from "@/components/parts";
import { Button } from "@/components/ui/button";
import { LIT_KEYS, PICTURE, type KeyCap } from "@/lib/a75";
import { api } from "@/lib/backend";
import { toast } from "sonner";
import { Brush, Pipette, PaintBucket, Upload } from "lucide-react";
import { t } from "@/lib/i18n";

type Rgb = [number, number, number];
type Tool = "brush" | "pick" | "fill";

const blank = (): Rgb[] => Array.from({ length: 128 }, () => [0, 0, 0] as Rgb);

const hsv = (h: number): Rgb => {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
};

const TEMPLATES: { id: string; name: string; make: () => Rgb[] }[] = [
  {
    id: "rainbow",
    name: t("横向彩虹"),
    make: () => {
      const c = blank();
      LIT_KEYS.forEach((k) => (c[k.slot] = hsv((k.x + k.w / 2) / PICTURE.w)));
      return c;
    },
  },
  {
    id: "gaming",
    name: t("游戏高亮"),
    make: () => {
      const c = blank();
      LIT_KEYS.forEach((k) => (c[k.slot] = [30, 40, 60]));
      ["W", "A", "S", "D", "Space", "Shift", "Ctrl", "Q", "E", "R"].forEach((n) =>
        LIT_KEYS.filter((k) => k.name === n).forEach((k) => (c[k.slot] = [255, 59, 48])),
      );
      return c;
    },
  },
  {
    id: "rows",
    name: t("分行渐变"),
    make: () => {
      const c = blank();
      LIT_KEYS.forEach((k) => {
        const t = (k.y + k.h / 2) / PICTURE.h;
        c[k.slot] = [Math.round(77 + 160 * t), Math.round(141 - 80 * t), 255 - Math.round(60 * t)];
      });
      return c;
    },
  },
  {
    id: "white",
    name: t("全部白色"),
    make: () => {
      const c = blank();
      LIT_KEYS.forEach((k) => (c[k.slot] = [255, 255, 255]));
      return c;
    },
  },
];

export default function Paint() {
  const [colors, setColors] = useState<Rgb[]>(() => TEMPLATES[0].make());
  const [brush, setBrush] = useState<Rgb>([77, 141, 255]);
  const [tool, setTool] = useState<Tool>("brush");
  const [slot, setSlot] = useState(0);
  const [writing, setWriting] = useState(false);
  const [dirty, setDirty] = useState(true);

  const light = useMemo(() => (k: KeyCap) => colors[k.slot], [colors]);

  const touch = (k: KeyCap) => {
    if (tool === "pick") {
      setBrush(colors[k.slot]);
      setTool("brush");
      return;
    }
    if (tool === "fill") {
      setColors(() => {
        const c = blank();
        LIT_KEYS.forEach((kk) => (c[kk.slot] = brush));
        return c;
      });
    } else {
      setColors((prev) => {
        const c = [...prev];
        c[k.slot] = brush;
        return c;
      });
    }
    setDirty(true);
  };

  const write = async () => {
    setWriting(true);
    try {
      await api.writePerKey(colors.flat(), true);
      setDirty(false);
      toast.success(t("已写入图案 {0}，键盘已切到逐键自定义", slot + 1));
    } catch (e) {
      toast.error(t("写入失败：{0}", e));
    } finally {
      setWriting(false);
    }
  };

  return (
    <Workspace
      stage={<Keyboard light={light} showKnob={false} onDragKey={touch} />}
      below={
        <div>
          <div className="mb-2.5 flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">{t("模板")}</h3>
            <span className="text-xs text-muted-foreground">{t("点一下套用，再用画笔细调")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setColors(t.make());
                  setDirty(true);
                }}
                className="flex h-[58px] flex-col justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-[13px] font-medium hover:border-input hover:bg-accent"
              >
                {t.name}
                <TemplateStrip colors={t.make()} />
              </button>
            ))}
          </div>
        </div>
      }
      panel={
        <>
          <Section title={t("图案槽位")}>
            <Segmented
              id="paint-slot"
              className="w-full"
              value={slot}
              options={[0, 1, 2].map((i) => [i, t("图案 {0}", i + 1)] as [number, string])}
              onChange={setSlot}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{t("原版驱动为这把键盘列出 3 个图案槽位。")}</p>
          </Section>
          <Section title={t("工具")}>
            <Segmented
              id="paint-tool"
              className="w-full"
              value={tool}
              options={[
                ["brush", <span className="flex items-center justify-center gap-1.5"><Brush className="size-3.5" />{t("画笔")}</span>],
                ["pick", <span className="flex items-center justify-center gap-1.5"><Pipette className="size-3.5" />{t("取色")}</span>],
                ["fill", <span className="flex items-center justify-center gap-1.5"><PaintBucket className="size-3.5" />{t("全部")}</span>],
              ]}
              onChange={setTool}
            />
            <p className="text-xs text-muted-foreground">
              {tool === "brush" && t("按住鼠标在键盘上拖动，可以连续涂色。")}
              {tool === "pick" && t("点一个键，取它的颜色作为画笔颜色。")}
              {tool === "fill" && t("点任意一个键，把所有键涂成画笔颜色。")}
            </p>
          </Section>
          <Section title={t("画笔颜色")}>
            <ColorSwatches id="paint-color" value={brush} onChange={setBrush} />
            <Button variant="outline" size="sm" onClick={() => { setBrush([0, 0, 0]); setTool("brush"); }}>
              {t("橡皮擦（熄灭按键）")}
            </Button>
          </Section>
          <Section title={t("写入")}>
            <Button onClick={write} disabled={writing || !dirty} className="w-full">
              <Upload />
              {writing ? t("正在写入…") : dirty ? t("写入图案 {0}", slot + 1) : t("已写入")}
            </Button>
            <Callout>{t("图案会存进键盘，所以不会边画边写。画好后点一次写入即可，连续写入之间软件会自动留出间隔。")}</Callout>
          </Section>
        </>
      }
    />
  );
}

function TemplateStrip({ colors }: { colors: Rgb[] }) {
  const row = LIT_KEYS.filter((k) => k.y > 60 && k.y < 80).sort((a, b) => a.x - b.x);
  return (
    <span className="flex h-1 w-full overflow-hidden rounded-full">
      {row.map((k) => (
        <span key={k.slot} className="h-full flex-1" style={{ background: `rgb(${colors[k.slot].join(",")})` }} />
      ))}
    </span>
  );
}
