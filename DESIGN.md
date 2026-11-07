---
name: 加密貨幣操作建議
description: A daily crypto action forecast, read like the 中央氣象署 weather forecast.
colors:
  ground: "#F4F8FB"
  panel: "#FFFFFF"
  line: "#D9E4EE"
  line-strong: "#B9CBDB"
  control-hover-edge: "#8FA9C2"
  office: "#174A7C"
  office-deep: "#0F365C"
  office-tint: "#E4EEF7"
  office-on-text: "#D3E2F1"
  focus-ring: "#6FA3D6"
  selection: "#C9DDF1"
  ink: "#1B2430"
  ink-2: "#44546A"
  ink-3: "#5F6F82"
  chart-ma: "#8C9BAB"
  button-disabled: "#8FA3B8"
  pill-neutral: "#E9EEF3"
  long: "#1F7A47"
  long-tint: "#E7F4EC"
  long-edge: "#A9D3B9"
  short: "#B42318"
  short-tint: "#FBE9E7"
  short-edge: "#EBB4AD"
  hold: "#2563A8"
  hold-tint: "#E6EFFA"
  hold-edge: "#AFC8E6"
  warn: "#A65E14"
  warn-tint: "#FDF1E3"
  warn-ink: "#6B3B08"
  hatch-light: "#F1F4F7"
  hatch-dark: "#E2E8EE"
  year-up-10: "#174A7C"
  year-up-5: "#2F6699"
  year-up-2: "#9DBEDD"
  year-up-0: "#DCEAF5"
  year-down-0: "#F8E0CC"
  year-down-2: "#EDB48A"
  year-down-5: "#A4501A"
  year-down-10: "#7A3410"
  year-up-2-text: "#13324F"
  year-down-0-text: "#4A2507"
  year-down-2-text: "#3D1E05"
typography:
  display:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "clamp(26px, 3.2vw, 36px)"
    fontWeight: 900
    lineHeight: 1.3
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  forecast-word:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: 1.25
  headline:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 900
  title:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 900
  masthead:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.02em"
  card-title:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  lede:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  figure:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    fontFeature: "tnum"
  body:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "tnum"
  subhead:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
  table:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
  label:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  caption:
    fontFamily: "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  swatch: "3px"
  sm: "8px"
  md: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "32px"
  section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.office}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.office-deep}"
  button-primary-disabled:
    backgroundColor: "{colors.button-disabled}"
  input-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  forecast-band:
    backgroundColor: "{colors.office}"
    textColor: "{colors.panel}"
    typography: "{typography.masthead}"
    padding: "18px 32px"
  settings-bar:
    backgroundColor: "{colors.panel}"
    padding: "16px 32px"
  coin-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "14px 16px 16px"
    height: "132px"
  coin-cell-long:
    backgroundColor: "{colors.long-tint}"
    textColor: "{colors.long}"
  coin-cell-short:
    backgroundColor: "{colors.short-tint}"
    textColor: "{colors.short}"
  coin-cell-hold:
    backgroundColor: "{colors.hold-tint}"
    textColor: "{colors.hold}"
  detail-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "22px 24px 24px"
    width: "400px"
  level-tile:
    backgroundColor: "{colors.ground}"
    typography: "{typography.figure}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  size-note:
    backgroundColor: "{colors.office-tint}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  alert-note:
    backgroundColor: "{colors.warn-tint}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  badge-long:
    backgroundColor: "{colors.long}"
    textColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  badge-short:
    backgroundColor: "{colors.short}"
    textColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  badge-hold:
    backgroundColor: "{colors.hold}"
    textColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  badge-neutral:
    backgroundColor: "{colors.pill-neutral}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  rule-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "22px 24px"
  verdict-pass:
    backgroundColor: "{colors.office}"
    textColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  verdict-fail:
    backgroundColor: "{colors.pill-neutral}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "2px 12px"
  year-block:
    rounded: "{rounded.sm}"
    padding: "10px 10px 9px"
    height: "86px"
  year-block-off:
    backgroundColor: "{colors.hatch-light}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "10px 10px 9px"
---

# Design System: 加密貨幣操作建議

## Overview

**Creative North Star: "The Forecast Office"**

The page is a public weather bulletin for trading: an office-blue masthead with issue time and next issue, one plain sentence for today (今日行動預報), a grid of per-coin forecasts, and the forecast's own verified track record (預報準確度) set out like a rainfall chart. It borrows the calm, civic voice of the 中央氣象署 forecast that its one reader already trusts: pale sky ground, white panels, a single institutional blue, and colour that only speaks when there is something to do.

Density is moderate and desktop-first. The answer sits at the top in heavy type; evidence lives one step below in lighter, smaller, tabular figures. Waiting (觀望) is rendered at the same size and weight as an actionable call, so "do nothing" reads as a forecast, not an empty state. The page is light throughout; an all-dark, low-contrast page is a confirmed rejection (PRODUCT.md accessibility note).

**Key Characteristics:**
- Pale sky ground (#F4F8FB) with white panels and hairline blue-grey borders; one deep office blue for authority.
- Signal colours (green, red, blue, amber) are reserved per state and never decorative.
- Year-by-year verification drawn as a graded colour band, like a rainfall map, with hatching for years the rule was not allowed to trade.
- Noto Sans TC throughout with tabular numerals; weight 900 carries the answers.
- Flat panels; soft blue-tinted shadow only on interactive or sticky surfaces.

## Colors

A cool civic palette: sky-pale neutrals and one forecast-office blue, with four reserved state colours and a separate eight-step diverging scale for verification.

### Primary
- **Forecast-Office Blue** (office): the masthead band, the primary 更新 button, the selected coin cell's edge, the 通過 verdict pill, checkbox accent, and the disclosure link. It is the voice of the institution, not of a trade signal.
- **Deep Office Blue** (office-deep): button hover only.
- **Office Mist** (office-tint): background of the position-size note (建議倉位) inside the detail panel.
- **Masthead Mist Text** (office-on-text): secondary text on the blue band (issue time, next issue).

### Secondary (state colours, reserved)
- **Long Green** (long) with **Long Tint** (long-tint) and **Long Edge** (long-edge): only for 做多 now (an enter-long signal): cell background, cell border, forecast word, solid badge.
- **Short Red** (short) with **Short Tint** and **Short Edge**: only for 放空 now.
- **Holding Blue** (hold) with **Hold Tint** and **Hold Edge**: 持有多單 / 持有空單, a position already open.
- **Warning Amber** (warn-tint ground, warn-ink text): stale signals, 近期轉弱 (recent 12 months negative), anything the reader must not miss but should not act on.

### Tertiary (year verification scale)
Eight graded steps from the BANDS scale, dark blue for strong positive years through pale blue and pale peach to deep brown for strong negative years: year-up-10 (≥ +10%), year-up-5 (+5～10), year-up-2 (+2～5), year-up-0 (0～2), year-down-0 (−2～0), year-down-2 (−5～−2), year-down-5 (−10～−5), year-down-10 (≤ −10%). Each step carries a chosen text colour: white on the four darkest steps, year-up-2-text on year-up-2, ink on year-up-0, year-down-0-text and year-down-2-text on the two peach steps. **Hatch Light / Hatch Dark** draw the 135° stripe for years that were not allowed to trade.

### Neutral
- **Sky Ground** (ground): page background, and the fill of level tiles inside the white detail panel.
- **Panel White** (panel): settings bar, coin cells, detail panel, rule cards, inputs.
- **Hairline** (line): panel borders, table row rules, section divider.
- **Firm Hairline** (line-strong): input borders, hovered cell border, scrollbar thumb.
- **Ink** (ink): primary text. **Ink 2** (ink-2): supporting sentences, form labels, the 觀望 forecast word. **Ink 3** (ink-3): prices, captions, table headers, status lines.
- **Pill Grey** (pill-neutral): neutral badge (無資料) and 未通過 verdict.
- **Focus Blue** (focus-ring), **Selection** (selection), **Control Hover Edge**, **Button Disabled**: interaction states only.

### Named Rules
**The Reserved Signal Rule.** Green means 做多 now, red means 放空 now, holding blue means a position is open, amber means warning. No other element may use these state tokens (the year scale has its own peach-to-brown steps), and waiting never borrows one: 觀望 stays ink-2 on white.

**The Rainfall Scale Rule.** Verification results use the blue-to-brown scale, never green and red, so a good past year can never be mistaken for a signal to act today.

**The Hatch Means Not Allowed Rule.** The 135° hatch (hatch-light 7px, hatch-dark 2px) marks only years the walk-forward rule was not allowed to trade, and the legend always says so in words.

## Typography

**Display Font:** Noto Sans TC (with Microsoft JhengHei, system-ui, sans-serif)
**Body Font:** Noto Sans TC, same stack
**Label/Mono Font:** none distinct; numerals use `font-variant-numeric: tabular-nums` on the body.

**Character:** One CJK sans family across four weights (400, 500, 700, 900); hierarchy comes from weight and size, not from a second face. Heavy 900 reads as the forecast itself; 400 and 500 carry the explanation.

### Hierarchy
- **Display** (900, clamp 26–36px, 1.3, −0.01em, balanced wrap): the 今日行動預報 headline sentence only.
- **Forecast Word** (900, 28px, 1.25): the one-word state in each coin cell (做多 / 放空 / 持有多單 / 觀望). Error state drops to 20px in ink-3.
- **Headline** (900, 26px): section heads such as 預報準確度.
- **Title** (900, 24px): coin symbol at the top of the detail panel.
- **Masthead** (700, 22px, +0.02em): page name on the blue band.
- **Card Title** (700, 18px): rule name on a rule card. 19px (700) heads the explanatory 說明 columns; the year value inside a year block is 19px at 900.
- **Lede** (400, 17px, max 70ch): the reason sentence under the headline and the intro under section heads.
- **Figure** (700, 17px): entry / stop / target numbers in the levels row.
- **Body** (400, 16px, 1.6): running text; detail panel and about columns step down to 15px.
- **Body small** (400, 15px): detail panel, settings inputs, about columns.
- **Subhead** (700, 19px; 900 for year values): about-section heads and the value on each year block.
- **Table** (400, 14px; header 500, 13px, ink-3): all tables, right-aligned figures, first column left-aligned.
- **Label** (500, 13px, ink-2): form field labels, year number in a year block.
- **Caption** (400, 12px, ink-3): level tile captions, percent change under figures, legend keys, swipe hint.

### Named Rules
**The Tabular Rule.** Every number on the page is tabular; prices, percentages and counts must align in columns and not jitter on refresh.

**The Heavy Answer Rule.** Weight 900 belongs to answers (headline sentence, forecast word, coin title, year value) and section heads. Explanations never go above 700.

## Layout

A single centred column, max 1280px, 32px gutters (16px at ≤600px). Full-bleed bands stack at the top: the office-blue masthead (18px vertical padding, baseline-aligned name / issue time / next issue pushed right) and the white settings bar (fields wrap with 12px row and 16px column gaps, aligned to their bottom edge; the auto-update checkbox takes a full row).

The forecast area is a two-column grid: coin grid (fluid) beside a 400px detail panel, 24px apart, top-aligned. Above 1020px the coin grid is exactly five columns with 12px gaps; the detail panel is sticky 16px from the top. At ≤1020px the detail panel drops below the grid and is no longer sticky; tapping a cell scrolls to it. At ≤600px the grid is two columns, number fields pair up at half width, the update button takes a full row, and the levels row goes to two columns.

Vertical rhythm: 36px above the headline, 56px between major sections (forecast, 預報準確度, 說明), 24px between rule cards, 18px from rule header to year strip. The year strip auto-fits blocks of at least 92px with 6px gaps; the legend's eight keys sit in a fixed eight-column row (four columns at ≤600px). The 說明 area auto-fits 300px columns with a 48px column gap under a hairline divider.

## Elevation & Depth

Flat by default: depth comes from white panels on the sky ground with hairline borders. Shadows are soft, wide, and tinted with office blue at very low alpha, and appear only on surfaces that respond to the reader.

### Shadow Vocabulary
- **Cell Hover** (`box-shadow: 0 4px 14px rgba(23, 74, 124, .08)`): a coin cell under the pointer.
- **Cell Selected** (`box-shadow: 0 0 0 1px #174A7C, 0 6px 18px rgba(23, 74, 124, .12)`): the coin whose detail is open; doubles the office-blue edge.
- **Sticky Panel** (`box-shadow: 0 8px 28px rgba(23, 74, 124, .07)`): the detail panel, which floats while the grid scrolls.

### Named Rules
**The Blue Air Rule.** Shadows are always blue-tinted, blurred, and offset straight down. Rule cards, settings and tables stay flat.

## Shapes

Gently rounded rectangles. Outer panels and coin cells use 10px; inner pieces (inputs, buttons, level tiles, notes, year blocks) use 8px; badges and verdicts are full pills; legend swatches are 3px. Borders are 1px hairlines; state cells swap both border and fill. The disclosure chevron is a 7px rotated corner (two 2px border sides), not a glyph.

## Components

### Buttons
Solid and plain, one per page.
- **Shape:** 8px corners, 40px tall, 22px side padding, weight 700.
- **Primary:** office blue with white text (更新).
- **Hover / Focus:** darkens to office-deep over .2s with the house ease; focus shows the 3px focus-blue outline offset 2px.
- **Disabled:** button-disabled grey with a progress cursor while data loads.

### Inputs / Fields
- **Style:** white, 1px firm hairline, 8px corners, 40px tall, 12px padding, 15px text; label above in 13px 500 ink-2 with a 4px gap.
- **Hover / Focus:** border shifts to control-hover-edge; focus uses the global 3px focus-blue outline.
- **Checkbox:** 18px native checkbox with office-blue accent colour, label in 14px ink-2.

### Forecast Band (masthead)
Office-blue full-bleed strip carrying the page name (masthead type), the issue line (依 … 收盤發布) and the next-issue line in office-on-text, baseline-aligned. On phones the name takes its own row and the two lines shrink to 13px.

### Coin Forecast Cell (各幣預報格)
A whole-cell button, min 132px tall, white with a hairline edge and 10px corners: symbol (700, 16px) and live price (13px ink-3) on one line, the forecast word below, then one or two caption lines (stop and target, or the reason for waiting). States: **long** (long-tint fill, long-edge border, long word), **short** (short tint/edge/word), **hold** (hold tint/edge/word), **wait** (plain white, ink-2 word), **error** (20px ink-3 word). Selected adds the office-blue double edge (aria-pressed).

### Detail Panel
White, 10px corners, 22–24px padding, sticky on desktop. Head row: coin title left, 即時價 right in ink-3. A pill badge in the state colour (solid fill, white text; pill-neutral for no data), then 15px explanation paragraphs 12px apart, the levels row, the size note or alert note, and a compact per-coin backtest table under a 14px ink-2 subhead.

### Levels Row
Three sky-ground tiles (進場 / 止損 / 止盈), 8px apart, 8px corners: 12px ink-3 caption, 17px 700 figure, and a 12px percent-change line under stop and target.

### Notes
- **Size note** (建議倉位): office-mist fill, 8px corners, 10px 12px padding.
- **Alert note**: warn-tint fill with warn-ink text, same shape; used for stale signals and 近期轉弱.

### Rule Card with Verdict Pill
White card, 10px corners, 22px 24px padding. Header wraps the rule name (card title) with a verdict pill: **pass** is office blue with white text (通過，會給訊號), **fail** is pill grey with ink-2 (未通過，不給訊號). Holds the optional alert, the year strip, the key legend, the summary table and the disclosure.

### Year Strip (signature)
One block per year, min 92px wide and 86px tall, 8px corners: year (13px 500), average return (19px 900), and a 12px caption (trade count and win rate). Allowed years take their background and text colour from the year scale; not-allowed years take the hatch with ink-2 text, the value drops to weight 500, and the caption reads 不允許交易. Blocks rise in (translateY 10px, .7s house ease) staggered 45ms per year; reduced motion removes it.

### Key Legend
13px ink-3 row under the strip: eight 12px-tall swatches with range labels in a fixed grid, highest to lowest, then a hatched swatch with the sentence explaining the hatch.

### Summary Table
14px tabular table with hairline row rules, 13px 500 ink-3 headers, row headers in 700 ink, figures right-aligned. Wrapped in a horizontal scroller with a 12px 表格可左右滑動 hint on phones.

### Disclosure (逐年完整數字)
Native details/summary in office blue, 14px 500, with the custom 7px chevron that rotates from pointing right to pointing down over .25s.

## Do's and Don'ts

### Do:
- **Do** keep the page light: sky ground, white panels, ink text.
- **Do** give 觀望 the same forecast-word size and weight as 做多 and 放空.
- **Do** colour a coin cell only by its current state: long, short, hold, or plain.
- **Do** draw verification on the eight-step blue-to-brown scale, each step with its own chosen text colour, and hatch years that were not allowed to trade.
- **Do** keep every number tabular and right-aligned in tables.
- **Do** tint any shadow with office blue (rgba(23, 74, 124, ≤.12)) and keep it on interactive or sticky surfaces.
- **Do** use the house ease cubic-bezier(.16, 1, .3, 1) for state changes and honour reduced motion.

### Don't:
- **Don't** use green or red anywhere except a 做多 / 放空 call that is valid now.
- **Don't** use green or red on the verification scale.
- **Don't** use the hatch for anything other than "not allowed to trade".
- **Don't** build an all-dark or low-contrast page.
- **Don't** turn the forecast into a stat-card dashboard or a wall of tables; the sentence and the grid come first, tables sit below them.

## Live chart (即時 K 線)

Full-width white panel below the coin grid, same corners and hairline as the rule cards (10px, #D9E4EE), 20px 24px padding, chart height 420px (320px at ≤600px). Follows the selected coin and timeframe. Built with TradingView Lightweight Charts 4.2.0 (attribution logo kept as its licence requires).

- Candles: up #2F6699, down #A4501A (the year scale's blue and rust; green and red stay reserved for signal states). No candle borders.
- 200-period moving average: #8C9BAB, 3px solid, no value label. It is the rule's first condition, so it is the only overlay.
- Price lines for an active position: entry #1B2430 solid, stop #A4501A dashed, target #174A7C dashed, each with an axis label (進場 / 止損 / 止盈).
- Closed candles come from the backtest data (last 800 shown, 160 visible on open); the forming candle is updated from Binance's public kline stream. Status line in caption style (13px, ink-3): "即時 <price> · <time> 更新", switching to the warn ink #6B3B08 when the stream drops.
- Grid lines #EEF3F8, scale borders #D9E4EE, axis text #44546A at 12px in the house face; times shown in local time.

