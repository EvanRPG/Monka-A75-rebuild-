// Key functions the picker offers, with Chinese labels. Entry codes come
// from sharkfin's hid-usages table (GPL-3.0-or-later), which records them
// against hardware; groups that the A75 has no use for are left out.
import type { Entry } from "./a75";

export interface KeyFn {
  label: string;
  /** Short form for the keycap. */
  cap?: string;
  entry: Entry;
}

const k = (usage: number, label: string, cap?: string): KeyFn => ({ label, cap, entry: [0, 0, usage, 0] });

export interface KeyGroup {
  id: string;
  name: string;
  items: KeyFn[];
}

export const GROUPS: KeyGroup[] = [
  {
    id: "letters",
    name: "字母",
    items: Array.from({ length: 26 }, (_, i) => k(4 + i, String.fromCharCode(65 + i))),
  },
  {
    id: "numbers",
    name: "数字与符号",
    items: [
      ...Array.from({ length: 9 }, (_, i) => k(30 + i, `${i + 1}`)),
      k(39, "0"),
      k(45, "- _", "-"),
      k(46, "= +", "="),
      k(47, "[ {", "["),
      k(48, "] }", "]"),
      k(49, "\\ |", "\\"),
      k(51, "; :", ";"),
      k(52, "' \"", "'"),
      k(53, "` ~", "`"),
      k(54, ", <", ","),
      k(55, ". >", "."),
      k(56, "/ ?", "/"),
    ],
  },
  {
    id: "fkeys",
    name: "功能键",
    items: [
      ...Array.from({ length: 12 }, (_, i) => k(58 + i, `F${i + 1}`)),
      ...Array.from({ length: 12 }, (_, i) => k(104 + i, `F${i + 13}`)),
    ],
  },
  {
    id: "mods",
    name: "修饰键",
    items: [
      k(224, "左 Ctrl", "Ctrl"),
      k(225, "左 Shift", "Shift"),
      k(226, "左 Alt", "Alt"),
      k(227, "左 Win", "Win"),
      k(228, "右 Ctrl", "Ctrl"),
      k(229, "右 Shift", "Shift"),
      k(230, "右 Alt", "Alt"),
      k(231, "右 Win", "Win"),
    ],
  },
  {
    id: "nav",
    name: "编辑与导航",
    items: [
      k(41, "Esc"),
      k(43, "Tab"),
      k(57, "大写锁定", "Caps"),
      k(40, "回车", "Enter"),
      k(42, "退格", "⌫"),
      k(44, "空格", "Space"),
      k(73, "Insert", "Ins"),
      k(76, "Delete", "Del"),
      k(74, "Home"),
      k(77, "End"),
      k(75, "PgUp"),
      k(78, "PgDn"),
      k(82, "↑"),
      k(81, "↓"),
      k(80, "←"),
      k(79, "→"),
      k(70, "截屏", "PrtSc"),
      k(71, "滚动锁定", "ScrLk"),
      k(72, "暂停", "Pause"),
      k(101, "菜单键", "Menu"),
    ],
  },
  {
    id: "media",
    name: "多媒体",
    items: [
      { label: "播放/暂停", cap: "⏯", entry: [3, 0, 205, 0] },
      { label: "下一首", cap: "⏭", entry: [3, 0, 181, 0] },
      { label: "上一首", cap: "⏮", entry: [3, 0, 182, 0] },
      { label: "停止", cap: "⏹", entry: [3, 0, 183, 0] },
      { label: "静音", cap: "静音", entry: [3, 0, 226, 0] },
      { label: "音量加", cap: "音量+", entry: [3, 0, 233, 0] },
      { label: "音量减", cap: "音量-", entry: [3, 0, 234, 0] },
      { label: "媒体播放器", cap: "媒体", entry: [3, 0, 131, 1] },
      { label: "邮件", entry: [3, 0, 138, 1] },
      { label: "计算器", entry: [3, 0, 146, 1] },
      { label: "此电脑", entry: [3, 0, 148, 1] },
      { label: "搜索", entry: [3, 0, 33, 2] },
      { label: "浏览器主页", cap: "主页", entry: [3, 0, 35, 2] },
      { label: "网页后退", cap: "后退", entry: [3, 0, 36, 2] },
      { label: "网页前进", cap: "前进", entry: [3, 0, 37, 2] },
      { label: "刷新", entry: [3, 0, 39, 2] },
      { label: "收藏夹", entry: [3, 0, 42, 2] },
      { label: "屏幕变亮", cap: "亮+", entry: [3, 0, 111, 0] },
      { label: "屏幕变暗", cap: "亮-", entry: [3, 0, 112, 0] },
    ],
  },
  {
    id: "mouse",
    name: "鼠标",
    items: [
      { label: "鼠标左键", cap: "左键", entry: [1, 0, 240, 0] },
      { label: "鼠标右键", cap: "右键", entry: [1, 0, 241, 0] },
      { label: "鼠标中键", cap: "中键", entry: [1, 0, 242, 0] },
      { label: "鼠标后退", cap: "后退", entry: [1, 0, 243, 0] },
      { label: "鼠标前进", cap: "前进", entry: [1, 0, 244, 0] },
      { label: "滚轮向上", cap: "滚上", entry: [1, 0, 245, 1] },
      { label: "滚轮向下", cap: "滚下", entry: [1, 0, 245, 255] },
    ],
  },
  {
    id: "light",
    name: "灯光控制",
    items: [
      { label: "灯光开关", cap: "灯开关", entry: [13, 0, 0, 0] },
      { label: "切换灯效", cap: "灯效", entry: [13, 1, 0, 0] },
      { label: "亮度加", cap: "亮度+", entry: [13, 2, 1, 0] },
      { label: "亮度减", cap: "亮度-", entry: [13, 2, 2, 0] },
      { label: "速度加", cap: "速度+", entry: [13, 3, 1, 0] },
      { label: "速度减", cap: "速度-", entry: [13, 3, 2, 0] },
      { label: "切换颜色", cap: "颜色", entry: [13, 5, 1, 0] },
      { label: "切换方向", cap: "方向", entry: [13, 5, 0, 0] },
    ],
  },
  {
    id: "board",
    name: "键盘功能",
    items: [
      { label: "Fn", entry: [10, 1, 0, 0] },
      { label: "锁定 Win 键", cap: "Win锁", entry: [10, 3, 0, 0] },
      { label: "WASD 与方向键互换", cap: "WASD", entry: [10, 10, 0, 0] },
      { label: "查看电量", cap: "电量", entry: [10, 8, 0, 0] },
      { label: "省电模式", cap: "省电", entry: [10, 12, 0, 0] },
      { label: "恢复出厂", cap: "复位", entry: [10, 2, 0, 0] },
    ],
  },
  {
    id: "link",
    name: "连接切换",
    items: [
      { label: "蓝牙 1", cap: "BT1", entry: [14, 0, 0, 0] },
      { label: "蓝牙 2", cap: "BT2", entry: [14, 0, 1, 0] },
      { label: "蓝牙 3", cap: "BT3", entry: [14, 0, 2, 0] },
      { label: "2.4G", entry: [14, 0, 5, 0] },
      { label: "有线", entry: [14, 0, 6, 0] },
    ],
  },
  {
    id: "special",
    name: "特殊",
    items: [{ label: "禁用此键", cap: "✕", entry: [0, 0, 0, 0] }],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function findFn(entry: number[]): KeyFn | undefined {
  return ALL.find((f) => same(f.entry, entry));
}

/** What a slot does, in words. `fnLayer` turns an empty slot into
 *  "跟随基础层" instead of "禁用". */
export function describe(entry: number[], fnLayer = false): string {
  if (entry.every((b) => b === 0)) return fnLayer ? "跟随基础层" : "已禁用";
  const f = findFn(entry);
  if (f) return f.label;
  const [tag, , b] = entry;
  if (tag === 9) return `宏 ${b + 1}${["", "（按一下开/关）", "（按住循环）"][entry[1]] ?? ""}`;
  if (tag === 0) return `组合键`;
  if (tag === 3) return "多媒体";
  if (tag === 13) return "灯光控制";
  return "厂商功能";
}

/** Short text for a keycap overlay. */
export function capText(entry: number[], fnLayer = false): string {
  if (entry.every((b) => b === 0)) return fnLayer ? "" : "✕";
  const f = findFn(entry);
  if (f) return f.cap ?? f.label;
  if (entry[0] === 9) return `M${entry[2] + 1}`;
  return "•";
}

export const sameEntry = same;

/** Browser KeyboardEvent.code to HID usage, for the keys the A75 has. */
export const CODE: Record<string, number> = {
  Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46, BracketLeft: 47,
  BracketRight: 48, Backslash: 49, Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55,
  Slash: 56, CapsLock: 57, PrintScreen: 70, ScrollLock: 71, Pause: 72, Insert: 73, Home: 74,
  PageUp: 75, Delete: 76, End: 77, PageDown: 78, ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81,
  ArrowUp: 82, ControlLeft: 224, ShiftLeft: 225, AltLeft: 226, MetaLeft: 227, ControlRight: 228,
  ShiftRight: 229, AltRight: 230, MetaRight: 231,
};
for (let i = 0; i < 26; i++) CODE[`Key${String.fromCharCode(65 + i)}`] = 4 + i;
for (let i = 1; i <= 9; i++) CODE[`Digit${i}`] = 29 + i;
CODE.Digit0 = 39;
for (let i = 1; i <= 12; i++) CODE[`F${i}`] = 57 + i;
