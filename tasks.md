# Implementation Plan: Expense & Budget Visualizer

## Overview

Implement a fully client-side, single-page expense tracker using HTML, CSS, and Vanilla JavaScript. The application follows a unidirectional data-flow pattern: user action → validate → mutate AppState → persist to LocalStorage → re-render UI. Chart.js is loaded via CDN for the pie chart. All code lives in three files: `index.html`, `css/style.css`, and `js/app.js`.

## Tasks

- [x] 1. Create project file structure and HTML skeleton
  - [x] 1.1 Create `index.html` with semantic structure
    - Add `<!DOCTYPE html>`, `<html lang="en" data-theme="light">`, `<head>` with charset, viewport, and title
    - Link `css/style.css` and Chart.js CDN (`https://cdn.jsdelivr.net/npm/chart.js`)
    - Scaffold all named regions: Balance_Display, Input_Form (name + amount + category `<select>` + submit), Category add section (input + submit), Sort_Control (`<select>` or button group), Transaction_List (`<ul>`), Chart `<canvas>`, error toast container, and theme toggle button
    - Defer-load `js/app.js` with `<script defer src="js/app.js">`
    - Add ARIA labels and roles to interactive controls for accessibility
    - _Requirements: 1.1, 2.1, 3.1, 4.2, 5.1, 7.1, 8.1, 8.5, 9.1, 10.1_

  - [x] 1.2 Create `css/style.css` with CSS custom properties for theming
    - Define `:root` / `[data-theme="light"]` and `[data-theme="dark"]` variable sets covering background, surface, text, accent, error, and border colors
    - Ensure contrast ratios ≥ 4.5:1 between text and background in both themes
    - Style all structural regions: header/balance area, form layout, category section, sort controls, scrollable transaction list (fixed height + `overflow-y: auto`), chart container, toast overlay (fixed top-right, z-index above content)
    - Add transitions for theme switch (≤ 100 ms)
    - _Requirements: 2.2, 9.2, 9.4, 10.1_

  - [x] 1.3 Create `js/app.js` — Constants, AppState, and Storage Module
    - Define `DEFAULT_CATEGORIES`, `STORAGE_KEYS` (`ebv_transactions`, `ebv_categories`, `ebv_theme`), and `SORT_OPTIONS` constants
    - Define the `AppState` object: `{ transactions, categories, sortOption, theme, chartInstance }`
    - Implement `StorageModule.load()` — reads all three keys, wraps each `JSON.parse` in `try/catch`, returns `null` per key on error, and shows the corrupted-data warning toast when parse fails
    - Implement `StorageModule.save()` — writes transactions, custom categories (excludes defaults), and theme; catches quota/write errors and shows the save-failure toast
    - Implement `StorageModule.clear()`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.3_

- [x] 2. Implement Validator and Category modules
  - [x] 2.1 Implement `ValidatorModule` in `js/app.js`
    - `validateTransaction(name, amount)` — checks name non-empty and ≤ 100 chars; checks amount is numeric, > 0, ≤ 999,999,999.99, and has at most 2 decimal places; returns `{ valid, errors }`
    - `validateCategory(name, existingCategories)` — checks name non-empty, ≤ 50 chars, case-insensitively unique against `existingCategories`; returns `{ valid, errors }`
    - _Requirements: 1.4, 1.5, 7.3, 7.4_

  - [ ]* 2.2 Write property test for `ValidatorModule` — invalid transactions always rejected
    - **Property 2: Invalid transactions are always rejected**
    - **Validates: Requirements 1.4, 1.5**
    - Use `fast-check` arbitraries: `fc.constant('')` for empty name, `fc.float({ max: 0 })` for non-positive amounts, strings with > 2 decimal places
    - Tag: `// Feature: expense-budget-visualizer, Property 2: Invalid transactions are always rejected`

  - [ ]* 2.3 Write property test for `ValidatorModule` — duplicate/empty categories always rejected
    - **Property 6: Duplicate and empty category names are always rejected**
    - **Validates: Requirements 7.3**
    - Use `fc.constant('')`, `fc.string()` mapped to whitespace-only variants, and case-shuffled copies of existing category names
    - Tag: `// Feature: expense-budget-visualizer, Property 6: Duplicate and empty category names are always rejected`

  - [x] 2.4 Implement `CategoryModule` in `js/app.js`
    - `CategoryModule.add(name)` — calls `ValidatorModule.validateCategory`, shows inline error on failure; on success appends to `AppState.categories`, calls `StorageModule.save()`, calls `RenderModule.renderCategorySelector()`
    - `CategoryModule.delete(name)` — removes from `AppState.categories` only if not a default, calls save and re-render
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 6.2_

  - [ ]* 2.5 Write property test for `CategoryModule` — custom category persistence round-trip
    - **Property 5: Custom category persistence round-trip**
    - **Validates: Requirements 7.2, 7.5, 6.2**
    - Use `fc.string({ minLength: 1, maxLength: 50 })` filtered to unique names; serialize then deserialize via `StorageModule`; assert category appears in restored list
    - Tag: `// Feature: expense-budget-visualizer, Property 5: Custom category persistence round-trip`

- [x] 3. Implement Transaction and Sort modules
  - [x] 3.1 Implement `TransactionModule` in `js/app.js`
    - `TransactionModule.add(name, amount, category)` — calls validator; on failure shows inline errors; on success creates `{ id: crypto.randomUUID(), name, amount: parseFloat(amount), category, createdAt: Date.now() }`, pushes to `AppState.transactions`, calls `StorageModule.save()`, calls `RenderModule.renderAll()`; resets form fields after success
    - `TransactionModule.delete(id, confirmed)` — if not confirmed, triggers browser `confirm()` dialog; if confirmed, removes item from `AppState.transactions`, calls `StorageModule.save()` (on save error shows delete-failure toast and aborts removal), calls `RenderModule.renderAll()`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4, 3.5, 6.1_

  - [ ]* 3.2 Write property test for `TransactionModule` — transaction persistence round-trip
    - **Property 1: Transaction persistence round-trip**
    - **Validates: Requirements 1.2, 6.1, 6.3**
    - Use `fc.record({ name: fc.string({ minLength: 1, maxLength: 100 }), amount: fc.float({ min: 0.01, max: 999999999.99 }), category: fc.constantFrom(...DEFAULT_CATEGORIES) })`; add transaction, serialize to mock Storage, deserialize, assert equivalent entry present
    - Tag: `// Feature: expense-budget-visualizer, Property 1: Transaction persistence round-trip`

  - [x] 3.3 Implement `SortModule` in `js/app.js`
    - `SortModule.apply(transactions, option)` — pure function returning a sorted copy; `amount_asc`: ascending by amount, tiebreak date desc; `amount_desc`: descending by amount, tiebreak date desc; `category_asc`: alphabetical by category, tiebreak date desc; `null`: date descending
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [ ]* 3.4 Write property test for `SortModule` — sort order invariant
    - **Property 7: Sort order invariant**
    - **Validates: Requirements 8.1, 8.2**
    - Use `fc.array(transactionArb, { minLength: 2 })` + `fc.constantFrom('amount_asc', 'amount_desc', 'category_asc')`; assert consecutive pairs satisfy the ordering constraint
    - Tag: `// Feature: expense-budget-visualizer, Property 7: Sort order invariant`

  - [ ]* 3.5 Write property test for `SortModule` — sort stability after add/delete
    - **Property 8: Sort stability after add/delete**
    - **Validates: Requirements 8.3, 8.4**
    - Add a transaction to an already-sorted list, re-apply sort, assert result still satisfies invariant; repeat for delete
    - Tag: `// Feature: expense-budget-visualizer, Property 8: Sort stability after add/delete`

- [x] 4. Checkpoint — core logic verified
  - Ensure all non-optional sub-tasks in tasks 1–3 pass; confirm `ValidatorModule`, `TransactionModule`, `CategoryModule`, and `SortModule` behave correctly. Ask the user if questions arise.

- [x] 5. Implement Chart, Theme, and Render modules
  - [x] 5.1 Implement `ChartModule` in `js/app.js`
    - `ChartModule.init(canvasEl)` — creates a `Chart` instance (type `'doughnut'` or `'pie'`) with empty initial data; stores reference in `AppState.chartInstance`
    - `ChartModule.update(transactions)` — groups positive-amount transactions by category, sums amounts, maps to Chart.js `data` and `backgroundColor` arrays (assign a stable distinct color per category); calls `chart.update()`; if no positive-amount transactions hide canvas and show empty-state message instead
    - `ChartModule.destroy()` — calls `AppState.chartInstance.destroy()` and nulls the reference
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.2 Write property test for `ChartModule.update` — chart covers all positive-amount categories
    - **Property 4: Category pie chart slices cover all positive-amount categories**
    - **Validates: Requirements 5.1, 5.2**
    - Mock `Chart` constructor; use `fc.array(transactionArb)` with at least one positive amount; assert chart dataset labels equal distinct categories of positive-amount transactions
    - Tag: `// Feature: expense-budget-visualizer, Property 4: Category pie chart slices cover all positive-amount categories`

  - [x] 5.3 Implement `ThemeModule` in `js/app.js`
    - `ThemeModule.apply(theme)` — sets `document.documentElement.dataset.theme = theme`, updates `AppState.theme`, calls `StorageModule.save()`
    - `ThemeModule.toggle()` — flips `AppState.theme` between `'light'` and `'dark'`, calls `ThemeModule.apply()`
    - `ThemeModule.load()` — reads theme from Storage (or defaults to `'light'`), calls `ThemeModule.apply()`; if Storage unavailable, silently defaults to `'light'`
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6_

  - [ ]* 5.4 Write property test for `ThemeModule` — theme toggle is its own inverse
    - **Property 9: Theme toggle is its own inverse**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
    - Use `fc.constantFrom('light', 'dark')`; apply starting theme, call `ThemeModule.toggle()` twice, assert `document.documentElement.dataset.theme` equals original value
    - Tag: `// Feature: expense-budget-visualizer, Property 9: Theme toggle is its own inverse`

  - [x] 5.5 Implement `RenderModule` in `js/app.js`
    - `renderBalance()` — sums all `AppState.transactions` amounts (expenses subtracted, income added); formats to 2 decimal places; prefixes with `−` if negative; writes to Balance_Display element
    - `renderList()` — calls `SortModule.apply(AppState.transactions, AppState.sortOption)`; clears and rebuilds `<ul>` with one `<li>` per transaction showing name, formatted amount, category, and a delete button; shows empty-state message when list is empty
    - `renderChart()` — calls `ChartModule.update(AppState.transactions)`
    - `renderCategorySelector()` — rebuilds `<select>` options from `[...DEFAULT_CATEGORIES, ...AppState.categories]`
    - `renderSortIndicator()` — highlights the active sort option in Sort_Control; clears highlight when `sortOption` is `null`
    - `renderAll()` — calls all five sub-functions in order
    - `showError(message)` — creates and appends a toast element; auto-dismisses after 5 s; stacks if multiple toasts are active
    - `showFieldError(field, message)` / `clearFieldErrors()` — injects/removes inline error `<span>` elements adjacent to form fields
    - _Requirements: 2.1, 2.3, 2.4, 3.6, 4.1, 4.3, 4.4, 4.5, 5.2, 5.4, 8.2, 8.5_

  - [ ]* 5.6 Write property test for balance calculation — balance equals sum of amounts
    - **Property 3: Balance equals sum of transaction amounts**
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
    - Use `fc.array(fc.record({ amount: fc.float({ min: 0.01, max: 999999999.99 }) }), { minLength: 0 })`; compute expected sum manually; assert `renderBalance()` output (parsed back to float) matches expected sum rounded to 2 decimal places
    - Tag: `// Feature: expense-budget-visualizer, Property 3: Balance equals sum of transaction amounts`

- [x] 6. Implement Init, event wiring, and global error handler
  - [x] 6.1 Implement `Init` bootstrap in `js/app.js`
    - Inside `DOMContentLoaded` listener: call `StorageModule.load()`, hydrate `AppState` (merge loaded data with defaults), call `ThemeModule.load()`, call `ChartModule.init(canvasEl)`, call `RenderModule.renderAll()`
    - Wire all DOM event listeners: Input_Form `submit` → `TransactionModule.add`; category form `submit` → `CategoryModule.add`; Sort_Control `change`/`click` → update `AppState.sortOption` + `RenderModule.renderList()` + `RenderModule.renderSortIndicator()`; theme toggle `click` → `ThemeModule.toggle()`; Transaction_List delete button clicks (event delegation) → `TransactionModule.delete`
    - Add `window.onerror` and `window.addEventListener('unhandledrejection')` handlers — log to console, call `RenderModule.showError('An unexpected error occurred')`, do not mutate AppState
    - _Requirements: 6.3, 8.2, 8.3, 8.4, 9.3, 10.2, 10.3, 10.4_

  - [ ]* 6.2 Write property test for Storage — corrupted storage produces clean initial state
    - **Property 10: Corrupted Storage produces clean initial state**
    - **Validates: Requirements 6.4**
    - Use `fc.string()` as arbitrary non-JSON Storage values; call `StorageModule.load()` with mocked Storage returning the arbitrary string; assert no exception thrown, transactions empty, categories equal `DEFAULT_CATEGORIES`
    - Tag: `// Feature: expense-budget-visualizer, Property 10: Corrupted Storage produces clean initial state`

- [x] 7. Final checkpoint — full integration verified
  - Ensure all non-optional tasks pass; manually verify in browser that add, delete, sort, custom category, theme toggle, and chart update all work without console errors. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) and can be run with Vitest (`vitest --run`) or Jest (`--experimental-vm-modules`)
- Storage API must be mocked (in-memory stub) in all unit and property tests; Chart.js must also be mocked since canvas is unavailable in Node.js
- Each property test must include a comment tag: `// Feature: expense-budget-visualizer, Property N: <title>`
- Minimum 100 iterations per property test (`fc.assert(fc.property(...), { numRuns: 100 })`)
- All render operations complete within 100 ms per requirements 2.3, 3.6, 4.3, 5.2, 8.2, 9.2
- Default categories (`Food`, `Transport`, `Fun`) are never written to Storage — they are always rehydrated from `DEFAULT_CATEGORIES` at startup

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.4"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.5", "5.1", "5.3"] },
    { "id": 4, "tasks": ["5.2", "5.4", "5.5"] },
    { "id": 5, "tasks": ["5.6", "6.1"] },
    { "id": 6, "tasks": ["6.2"] }
  ]
}
```
