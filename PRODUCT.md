# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, no build step, served by GitHub Pages (https://pagani951221-tech.github.io/crypto-signals/). `strategy.js` is shared between the browser page and Node scripts.

## Users

One individual crypto trader (the owner), Traditional Chinese speaker in Taiwan. Usually opens the page on a desktop computer and reads it carefully before deciding whether to place an order.

## Product Purpose

Tell the user, per coin, whether to act right now: buy, short, hold, or wait, with concrete entry, stop-loss, take-profit and position size. Every recommendation is backed by a rule that passed a year-by-year walk-forward backtest on real Binance history; when no rule passes, the page says so and recommends waiting.

## Positioning

It refuses to give signals it cannot defend. A single pre-researched rule is re-validated live on ten major coins every time the page opens (costs, slippage and real funding rates included), and failures are shown as plainly as passes.

## Operating Context

- Data: Binance public spot klines and USDT-perpetual funding rates, fetched in the browser; no keys, no server.
- Timeframes: daily, 4-hour, 1-hour, 15-minute. Only daily long currently passes validation; the others show "not passed".
- Inputs: coin list, timeframe, capital (USDT), risk % per trade, reward-risk ratio (default 2, minimum 1.5), auto-refresh with browser notifications.
- Signals change only at candle close (daily close is 08:00 Taiwan time).

## Capabilities and Constraints

- Per-coin states: enter long/short (with live-price freshness check), holding, waiting, skipped (coin's own history negative or no perpetual contract).
- Validation shown per direction: yearly rows (allowed or not), walk-forward total, last 12 months, full history; win rate, realized payoff ratio, breakeven win rate, average per trade, t value.
- All copy is Traditional Chinese.

## Evidence on Hand

Live backtest results computed in the page; research scripts research.js to research4.js. No testimonials, track record of real trades, or performance claims beyond the backtests.

## Product Principles

1. The answer to "should I act now?" comes first; the evidence is one step below it.
2. Never present a backtest as a promise; disclaimers and weak spots (e.g. recent 12 months negative) stay visible.
3. Waiting is a first-class answer, not an empty state.
4. Numbers must stay readable as a decision aid, not an engineering report.

## Accessibility & Inclusion

Owner finds an all-dark, low-contrast page tiring for long reading sessions.
