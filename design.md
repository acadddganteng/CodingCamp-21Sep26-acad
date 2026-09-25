# Design Document: Expense & Budget Visualizer

## Overview

The Expense & Budget Visualizer is a fully client-side, single-page web application built with plain HTML, CSS, and Vanilla JavaScript. There is no backend, no build pipeline, and no framework dependency. All state is stored in the browser's Local Storage and all rendering is done via DOM manipulation and the Chart.js library for the pie chart.

The application lets users record expense transactions, categorize them, view a running total balance, visualize spending distribution as a pie chart, sort the transaction list, define custom categories, and toggle between dark and light display modes. It can be delivered as a standalone HTML page or packaged as a browser extension.

### Design Goals

- Zero external runtime dependencies except Chart.js (loaded via CDN)
- Predictable, synchronous data flow: user action → validate → update in-memory state → re-render UI → persist to Storage
- Clear separation of concerns across three logical layers: data, logic, and presentation
- All UI updates complete within 100 ms as required by the spec
- Accessible color contrast (≥ 4.5:1 ratio) in both themes, meeting WCAG 2.1 AA

---

## Architecture

The application follows a unidirectional data-flow pattern within a single JavaScript module:

```
User Interaction
      │
      ▼
 Event Handler  (captures DOM events, calls action functions)
      │
      ▼
  Action Layer  (validate input, mutate in-memory AppState)
      │
      ├──► Storage Layer  (read/write Local Storage, handle errors)
      │
      ▼
 Render Layer   (reads AppState, rebuilds DOM, updates Chart)
```

Because there is no framework, the render functions are idempotent: they always rebuild the affected section of the DOM from the current `AppState` snapshot. This keeps state management simple and avoids stale-view bugs.

### Module Structure (single `js/app.js` file)

The single JavaScript file is organized into clearly named sections using block comments:

```
js/app.js
  ├── Constants & Configuration
  ├── AppState  (the single source of truth)
  ├── Storage Module  (load, save, clear helpers)
  ├── Validator Module  (pure validation functions)
  ├── Category Module  (category CRUD operations)
  ├── Transaction Module  (transaction CRUD operations)
  ├── Sort Module  (sort logic)
  ├── Chart Module  (Chart.js wrapper)
  ├── Theme Module  (dark/light toggle)
  ├── Render Module  (all DOM manipulation)
  └── Init  (DOMContentLoaded bootstrap)
```

### File Layout

```
index.html          — single HTML entry point
css/
  style.css         — all styles, CSS custom properties for theming
js/
  app.js            — all application logic
```

---

## Components and Interfaces

### AppState

The single in-memory state object. All modules read from and write to this object exclusively; no module queries the DOM to derive state.

```js
const AppState = {
  transactions: [],       // Transaction[]
  categories: [],         // string[] — default + custom category names
  sortOption: null,       // SortOption | null — currently active sort
  theme: 'light',         // 'light' | 'dark'
  chartInstance: null,    // Chart.js instance reference
};
```

### Storage Module

Responsible for all Local Storage I/O. Exposes:

```js
StorageModule.load()   // → { transactions, categories, theme } | null
StorageModule.save()   // persists AppState.transactions, .categories, .theme
StorageModule.clear()  // clears all app keys from Storage
```

Uses a single namespaced key prefix (`ebv_`) to avoid collisions. All reads are wrapped in `try/catch`; parse errors result in a `null` return so the caller can handle corrupted data.

### Validator Module

Pure functions with no side effects:

```js
ValidatorModule.validateTransaction(name, amount) // → { valid: bool, errors: string[] }
ValidatorModule.validateCategory(name, existingCategories) // → { valid: bool, errors: string[] }
```

Validation rules:
- Name: non-empty, 1–100 characters
- Amount: numeric, > 0, max 2 decimal places, ≤ 999,999,999.99
- Category name: non-empty, 1–50 characters, case-insensitive uniqueness check

### Transaction Module

```js
TransactionModule.add(name, amount, category)  // validates, creates, appends to AppState, saves, re-renders
TransactionModule.delete(id, confirmed)         // removes from AppState, saves, re-renders
```

Each transaction is assigned a `crypto.randomUUID()` id at creation time.

### Category Module

```js
CategoryModule.add(name)     // validates, appends to AppState.categories, saves, re-renders
CategoryModule.delete(name)  // removes from AppState.categories, saves, re-renders selector
```

Default categories (`Food`, `Transport`, `Fun`) are constants and cannot be deleted.

### Sort Module

```js
SortModule.apply(transactions, option)  // → Transaction[] sorted by option
```

Pure function. `AppState.sortOption` is updated by the event handler; `RenderModule.renderList()` always calls `SortModule.apply()` before rendering.

Sort options: `amount_asc`, `amount_desc`, `category_asc`. Tiebreaker: date descending (creation timestamp).

### Chart Module

Wraps Chart.js. Maintains a single `Chart` instance stored in `AppState.chartInstance` to support `chart.update()` calls instead of full recreation on each data change.

```js
ChartModule.init(canvasEl)           // creates initial Chart instance
ChartModule.update(transactions)     // recomputes slice data, calls chart.update()
ChartModule.destroy()                // cleanup
```

Chart data is derived by grouping `transactions` by category, summing positive amounts per category, then mapping to Chart.js `data` and `backgroundColor` arrays. An empty-state message is shown (chart hidden) when no positive-amount transactions exist.

### Theme Module

```js
ThemeModule.apply(theme)    // sets data-theme attribute on <html>, saves to Storage
ThemeModule.toggle()        // flips between 'light' and 'dark', calls apply
ThemeModule.load()          // reads saved theme from Storage or defaults to 'light'
```

Theming is implemented entirely via CSS custom properties scoped to `[data-theme="dark"]` and `[data-theme="light"]` on the `<html>` element. No class toggling on individual elements is needed.

### Render Module

All DOM writes live here. Each function takes its data from `AppState`:

```js
RenderModule.renderAll()              // calls all render sub-functions
RenderModule.renderList()             // rebuilds Transaction_List
RenderModule.renderBalance()          // updates Balance_Display text
RenderModule.renderChart()            // calls ChartModule.update()
RenderModule.renderCategorySelector() // rebuilds <select> options
RenderModule.renderSortIndicator()    // updates Sort_Control active indicator
RenderModule.showError(message)       // displays a non-blocking error toast
RenderModule.showFieldError(field, message) // shows inline field error
RenderModule.clearFieldErrors()       // removes all inline errors
```

---

## Data Models

### Transaction

```js
{
  id:        string,   // UUID, generated at creation via crypto.randomUUID()
  name:      string,   // 1–100 characters, item description
  amount:    number,   // positive float, max 2 decimal places
  category:  string,   // category label (one of AppState.categories)
  createdAt: number,   // Unix timestamp ms, Date.now() at creation
}
```

### Category

Categories are stored as a plain `string[]` in `AppState.categories` and in Local Storage. The three default labels (`"Food"`, `"Transport"`, `"Fun"`) are always prepended at load time from a constants array even if Storage is empty.

```js
DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun']
```

### Sort Option

```js
type SortOption = 'amount_asc' | 'amount_desc' | 'category_asc' | null
```

`null` means the default display order: date descending, with no Sort_Control option highlighted.

### Theme

```js
type Theme = 'light' | 'dark'
```

### Local Storage Schema

All keys are prefixed with `ebv_`:

| Key | Value |
|---|---|
| `ebv_transactions` | `JSON.stringify(Transaction[])` |
| `ebv_categories` | `JSON.stringify(string[])` — custom categories only (defaults not stored) |
| `ebv_theme` | `"light"` or `"dark"` |

Default categories are not stored; they are always rehydrated from `DEFAULT_CATEGORIES` at startup. This prevents issues if the default list changes in a future version.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transaction persistence round-trip

*For any* valid transaction (non-empty name, positive amount with at most 2 decimal places, valid category), after it is added to the app and AppState is serialized to Storage then deserialized back, the resulting transaction list shall contain an entry equivalent to the original transaction.

**Validates: Requirements 1.2, 6.1, 6.3**

### Property 2: Invalid transactions are always rejected

*For any* input where the name is empty, the amount is zero, negative, non-numeric, or has more than 2 decimal places, the validator shall return a non-empty errors array and the transaction list size shall remain unchanged.

**Validates: Requirements 1.4, 1.5**

### Property 3: Balance equals sum of transaction amounts

*For any* list of transactions, the computed balance displayed shall equal the arithmetic sum of all transaction amounts (with expenses subtracted and income added), formatted to exactly 2 decimal places.

**Validates: Requirements 4.1, 4.3, 4.4, 4.5**

### Property 4: Category pie chart slices cover all positive-amount categories

*For any* non-empty list of transactions containing at least one positive amount, the set of category labels in the chart's dataset shall be exactly equal to the set of distinct categories among transactions with amount > 0.

**Validates: Requirements 5.1, 5.2**

### Property 5: Custom category persistence round-trip

*For any* valid custom category name (non-empty, 1–50 characters, case-insensitively unique), after it is added and the storage is serialized then deserialized, the category selector shall include that category name.

**Validates: Requirements 7.2, 7.5, 6.2**

### Property 6: Duplicate and empty category names are always rejected

*For any* category name that is either empty, all-whitespace, or case-insensitively equal to an existing category, the validator shall return a non-empty errors array and the category list shall remain unchanged.

**Validates: Requirements 7.3**

### Property 7: Sort order invariant

*For any* list of transactions and any active sort option, the resulting list shall satisfy the ordering constraint for that option: consecutive transactions shall be non-decreasing by amount for `amount_asc`, non-increasing by amount for `amount_desc`, and lexicographically non-decreasing by category label for `category_asc`. Where two transactions share the same sort key, they shall be ordered by creation date descending.

**Validates: Requirements 8.1, 8.2**

### Property 8: Sort stability after add/delete

*For any* active sort option, adding or deleting a transaction and re-applying the sort shall produce a list that still satisfies the sort invariant for that option.

**Validates: Requirements 8.3, 8.4**

### Property 9: Theme toggle is its own inverse

*For any* starting theme (`light` or `dark`), toggling the theme twice shall return the application to the original theme, and the `data-theme` attribute on `<html>` shall equal the original value.

**Validates: Requirements 9.1, 9.2, 9.3, 9.5**

### Property 10: Corrupted Storage produces clean initial state

*For any* corrupted or unparseable Storage value, after the app loads, the transaction list shall be empty, the category list shall equal the default categories, and no JavaScript error shall be thrown.

**Validates: Requirements 6.4**

---

## Error Handling

### Storage Unavailable on Write

Triggered when Local Storage throws (e.g., quota exceeded, private browsing with storage blocked). The app catches the exception, displays a non-blocking toast message ("Your changes could not be saved"), and keeps the in-memory `AppState` intact so the user can continue working. The failed transaction or category is **not** added to the Transaction_List (Requirement 1.6).

### Storage Unavailable on Load

Caught at startup in `StorageModule.load()`. A non-blocking warning toast is shown ("Storage is unavailable — changes will not be saved this session"). The app initializes with empty transactions and default categories and operates in-memory for the session. Theme defaults to `light` silently (Requirement 9.6).

### Corrupted Storage Data

If `JSON.parse()` throws on any stored key, `StorageModule.load()` returns `null` for that key. The app shows a non-blocking warning ("Some saved data could not be loaded and has been cleared"), discards the corrupted key via `localStorage.removeItem()`, and initializes the affected slice with its default value (Requirement 6.4).

### Validation Errors

Inline error messages are injected adjacent to the offending field. They are removed when the field is next edited or the form is successfully submitted. No toast is used for validation errors — they appear inline to preserve form context (Requirements 1.4, 1.5, 7.3, 7.4).

### Deletion Failure

If `localStorage.setItem()` throws during a delete operation, the item is left visible in the Transaction_List and a toast error is shown ("Deletion failed — please try again") (Requirement 3.5).

### JavaScript Errors (Global Safety Net)

A `window.onerror` / `window.addEventListener('unhandledrejection')` handler catches unexpected runtime errors, logs them to the console, and displays a generic toast error without crashing the UI. AppState is not mutated on an unhandled error path (Requirement 10.4).

### Error Toast Design

Toasts are non-blocking: they appear as a fixed overlay at the top-right corner, auto-dismiss after 5 seconds, and stack if multiple errors occur simultaneously. They do not interrupt user interaction.

---

## Testing Strategy

Because the entire application is Vanilla JavaScript with no build pipeline, tests are written and run directly in the browser or in a Node.js environment using a zero-config test runner (Vitest or Jest with `--experimental-vm-modules`). The Storage API is mocked via a simple in-memory stub.

### Dual Testing Approach

**Unit / Example-based tests** cover:
- Validator functions: specific valid and invalid inputs
- Balance calculation: zero transactions, single transaction, multiple transactions with rounding
- Sort functions: empty list, single item, two items, ties
- Storage helpers: load with valid data, load with corrupted JSON, load when unavailable
- Theme module: apply, toggle, default fallback

**Property-based tests** (using [fast-check](https://github.com/dubzzz/fast-check)) cover the correctness properties listed above. Each property test runs a minimum of 100 iterations.

Property test tagging format:
```
// Feature: expense-budget-visualizer, Property 1: Transaction persistence round-trip
```

### Property Test Mapping

| Property | Test Focus | fast-check Arbitraries |
|---|---|---|
| P1 — Transaction round-trip | serialize → deserialize preserves data | `fc.record({ name: fc.string(), amount: fc.float(), category: fc.constantFrom(...) })` |
| P2 — Invalid transactions rejected | validator rejects bad inputs | `fc.oneof(fc.constant(''), fc.float({ max: 0 }), invalid amount strings)` |
| P3 — Balance equals sum | computed balance matches manual sum | `fc.array(fc.record({ amount: fc.float({ min: 0.01 }) }))` |
| P4 — Chart covers all categories | chart labels match positive-amount categories | `fc.array(transactionArb)` with at least one positive amount |
| P5 — Category round-trip | serialize → deserialize preserves custom categories | `fc.string({ minLength: 1, maxLength: 50 })` filtered for uniqueness |
| P6 — Duplicate/empty rejected | validator rejects bad category names | empty strings, whitespace, case variants of existing names |
| P7 — Sort order invariant | consecutive items satisfy ordering constraint for all 3 sort options | `fc.array(transactionArb, { minLength: 2 })` + `fc.constantFrom('amount_asc', 'amount_desc', 'category_asc')` |
| P8 — Sort stability after add/delete | sorted list remains valid after mutation | `fc.array(transactionArb)` + `fc.constantFrom(...sortOptions)` |
| P9 — Theme toggle is involutory | double toggle returns to original theme | `fc.constantFrom('light', 'dark')` |
| P10 — Corrupted storage → clean state | no throw, empty state | `fc.string()` (arbitrary non-JSON strings) |

### Integration / Example Tests

- Full add-transaction flow: fill form → submit → verify Transaction_List, Balance_Display, and Chart update
- Delete flow: add → delete with confirm → verify removal; delete → cancel → verify no removal
- Dark mode persistence: toggle → reload (mock Storage) → verify theme restored
- Empty state messages: no transactions → verify empty-state text in list and chart

### Accessibility Testing Notes

Automated contrast ratio checks are limited. Full WCAG 2.1 AA validation for the 4.5:1 contrast requirement (Requirement 9.4) requires manual review with a browser accessibility tool (e.g., axe DevTools) or a dedicated contrast checker, as runtime CSS custom property values cannot be reliably asserted in unit tests.

### Test Configuration

- Minimum 100 iterations per property test
- Storage mock resets between each test
- Chart.js is mocked in unit/property tests (canvas not available in Node.js environments)
- Each property test includes a comment tag: `// Feature: expense-budget-visualizer, Property N: <property title>`
