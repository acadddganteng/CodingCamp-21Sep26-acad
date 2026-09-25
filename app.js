/* =============================================================================
   Expense & Budget Visualizer — app.js
   Single-file application module.
   Architecture: User Interaction → Event Handler → Action Layer → Storage → Render
   ============================================================================= */

/* =============================================================================
   SECTION 1: Constants & Configuration
   ============================================================================= */

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

const STORAGE_KEYS = {
  transactions: 'ebv_transactions',
  categories:   'ebv_categories',
  theme:        'ebv_theme',
};

const SORT_OPTIONS = {
  AMOUNT_ASC:   'amount_asc',
  AMOUNT_DESC:  'amount_desc',
  CATEGORY_ASC: 'category_asc',
};

/* =============================================================================
   SECTION 2: AppState — single source of truth
   All modules read from and write to this object exclusively.
   No module queries the DOM to derive state.
   ============================================================================= */

const AppState = {
  /** @type {Array<{id: string, name: string, amount: number, category: string, createdAt: number}>} */
  transactions: [],

  /** @type {string[]} — default + custom category names */
  categories: [],

  /** @type {'amount_asc'|'amount_desc'|'category_asc'|null} */
  sortOption: null,

  /** @type {'light'|'dark'} */
  theme: 'light',

  /** @type {import('chart.js').Chart|null} */
  chartInstance: null,
};

/* =============================================================================
   SECTION 3: Storage Module
   All Local Storage I/O lives here. Uses the ebv_ key prefix to avoid
   collisions with other apps stored in the same origin.
   ============================================================================= */

const StorageModule = (() => {
  /**
   * Attempt to read and parse a single Storage key.
   * Returns the parsed value on success, or null on missing/corrupt data.
   * Calls the corrupted-data toast when JSON.parse fails on an existing value.
   *
   * @param {string} key
   * @returns {*|null}
   */
  function _readKey(key) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // Storage is completely unavailable (e.g., SecurityError in private browsing)
      return null;
    }

    if (raw === null) {
      // Key simply doesn't exist yet — not an error
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      // Value exists but is not valid JSON — corrupted data
      // Remove the corrupted key so the app starts clean next time
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      // Show a warning toast (deferred call — RenderModule defined later)
      _deferredShowWarning(
        'Some saved data could not be loaded and has been cleared.'
      );
      return null;
    }
  }

  /**
   * Deferred toast helper — RenderModule may not be defined when this module
   * is parsed, so we use a zero-timeout to push the call after the full module
   * is initialized.
   *
   * @param {string} message
   */
  function _deferredShowWarning(message) {
    setTimeout(() => {
      if (typeof RenderModule !== 'undefined' && RenderModule.showError) {
        RenderModule.showError(message);
      }
    }, 0);
  }

  /**
   * Load all persisted data from Storage.
   * Returns an object with the loaded slices (each may be null).
   *
   * @returns {{ transactions: Array|null, categories: Array|null, theme: string|null }}
   */
  function load() {
    let storageAvailable = true;
    try {
      localStorage.getItem(STORAGE_KEYS.transactions); // probe availability
    } catch {
      storageAvailable = false;
    }

    if (!storageAvailable) {
      // Storage is completely unavailable — warn and return nulls so caller
      // can initialize with defaults (Requirement 6.5)
      _deferredShowWarning(
        'Storage is unavailable — changes will not be saved this session.'
      );
      return { transactions: null, categories: null, theme: null };
    }

    return {
      transactions: _readKey(STORAGE_KEYS.transactions),
      categories:   _readKey(STORAGE_KEYS.categories),
      theme:        _readKey(STORAGE_KEYS.theme),
    };
  }

  /**
   * Persist the current AppState slices to Storage.
   * Custom categories only (DEFAULT_CATEGORIES are never written to Storage).
   * On quota / write error: shows a save-failure toast and does NOT mutate
   * AppState (the caller is responsible for rolling back if needed).
   *
   * @returns {boolean} true on success, false on failure
   */
  function save() {
    // Compute custom-only categories (exclude defaults)
    const customCategories = AppState.categories.filter(
      (cat) => !DEFAULT_CATEGORIES.includes(cat)
    );

    try {
      localStorage.setItem(
        STORAGE_KEYS.transactions,
        JSON.stringify(AppState.transactions)
      );
      localStorage.setItem(
        STORAGE_KEYS.categories,
        JSON.stringify(customCategories)
      );
      localStorage.setItem(
        STORAGE_KEYS.theme,
        JSON.stringify(AppState.theme)
      );
      return true;
    } catch (err) {
      // Quota exceeded or write denied
      _deferredShowWarning(
        'Your changes could not be saved.'
      );
      return false;
    }
  }

  /**
   * Remove all ebv_ keys from Storage.
   */
  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEYS.transactions);
      localStorage.removeItem(STORAGE_KEYS.categories);
      localStorage.removeItem(STORAGE_KEYS.theme);
    } catch {
      // Ignore errors on clear — best-effort cleanup
    }
  }

  return { load, save, clear };
})();

/* =============================================================================
   SECTION 4: Validator Module
   Pure validation functions — no side effects, no DOM access.
   ============================================================================= */

const ValidatorModule = (() => {
  /**
   * Validate a transaction's name and amount.
   *
   * Rules:
   *   name   — non-empty, at most 100 characters
   *   amount — numeric string or number, > 0, ≤ 999,999,999.99,
   *            at most 2 decimal places
   *
   * @param {string} name
   * @param {string|number} amount
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateTransaction(name, amount) {
    const errors = [];

    // --- Name validation ---
    const trimmedName = (name ?? '').toString().trim();
    if (trimmedName.length === 0) {
      errors.push('Item name is required.');
    } else if (trimmedName.length > 100) {
      errors.push('Item name must be 100 characters or fewer.');
    }

    // --- Amount validation ---
    const amountStr = (amount ?? '').toString().trim();

    if (amountStr.length === 0) {
      errors.push('Amount is required.');
    } else {
      // Must be a valid finite number (reject NaN, Infinity, exponent notation
      // that browsers accept but that violates the spec's "at most 2 decimal places")
      const numericRegex = /^-?\d+(\.\d+)?$/;
      if (!numericRegex.test(amountStr)) {
        errors.push('Amount must be a valid number.');
      } else {
        const parsed = parseFloat(amountStr);

        if (parsed <= 0) {
          errors.push('Amount must be greater than zero.');
        } else if (parsed > 999_999_999.99) {
          errors.push('Amount must not exceed 999,999,999.99.');
        } else {
          // Check decimal places
          const dotIndex = amountStr.indexOf('.');
          if (dotIndex !== -1 && amountStr.length - dotIndex - 1 > 2) {
            errors.push('Amount must have at most 2 decimal places.');
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a new category name against the list of existing categories.
   *
   * Rules:
   *   name — non-empty, at most 50 characters,
   *           case-insensitively unique within existingCategories
   *
   * @param {string} name
   * @param {string[]} existingCategories
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function validateCategory(name, existingCategories) {
    const errors = [];

    const trimmedName = (name ?? '').toString().trim();

    if (trimmedName.length === 0) {
      errors.push('Category name is required.');
    } else if (trimmedName.length > 50) {
      errors.push('Category name must be 50 characters or fewer.');
    } else {
      // Case-insensitive duplicate check
      const lower = trimmedName.toLowerCase();
      const existing = (existingCategories ?? []).map((c) =>
        c.toString().toLowerCase()
      );
      if (existing.includes(lower)) {
        errors.push('A category with this name already exists.');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  return { validateTransaction, validateCategory };
})();

/* =============================================================================
   SECTION 5: Category Module
   Handles adding and deleting custom categories.
   Default categories (DEFAULT_CATEGORIES) cannot be deleted.
   ============================================================================= */

const CategoryModule = (() => {
  /**
   * Add a new custom category.
   * Validates the name against existing categories, shows inline errors on
   * failure, and on success appends to AppState.categories, persists to
   * Storage, and re-renders the category selector.
   *
   * @param {string} name - The proposed custom category name.
   * @returns {boolean} true if the category was added, false if validation failed.
   */
  function add(name) {
    // Clear any previous inline errors on the category field
    if (typeof RenderModule !== 'undefined' && RenderModule.clearFieldErrors) {
      RenderModule.clearFieldErrors('category-name');
    }

    const { valid, errors } = ValidatorModule.validateCategory(
      name,
      AppState.categories
    );

    if (!valid) {
      // Show the first error inline adjacent to the category input field
      if (typeof RenderModule !== 'undefined' && RenderModule.showFieldError) {
        RenderModule.showFieldError('category-name', errors[0]);
      }
      return false;
    }

    // Append and persist
    AppState.categories.push(name.trim());
    StorageModule.save();

    // Re-render the category <select> so the new option is available
    if (typeof RenderModule !== 'undefined' && RenderModule.renderCategorySelector) {
      RenderModule.renderCategorySelector();
    }

    return true;
  }

  /**
   * Delete a custom category.
   * Default categories are protected and will not be removed.
   * On success persists to Storage and re-renders the category selector.
   *
   * @param {string} name - The category name to remove.
   * @returns {boolean} true if removed, false if the category is a default or not found.
   */
  function del(name) {
    // Guard: never remove a default category
    if (DEFAULT_CATEGORIES.includes(name)) {
      return false;
    }

    const index = AppState.categories.indexOf(name);
    if (index === -1) {
      return false;
    }

    AppState.categories.splice(index, 1);
    StorageModule.save();

    // Re-render the category <select>
    if (typeof RenderModule !== 'undefined' && RenderModule.renderCategorySelector) {
      RenderModule.renderCategorySelector();
    }

    return true;
  }

  return { add, delete: del };
})();

/* =============================================================================
   SECTION 6: Transaction Module
   Handles adding and deleting transactions.
   ============================================================================= */

const TransactionModule = (() => {
  /**
   * Add a new transaction.
   *
   * Validates name and amount; shows inline errors on failure.
   * On success: creates the transaction object, pushes it to AppState,
   * persists to Storage, re-renders all UI, and resets the form.
   * If Storage.save() fails the transaction is rolled back and a toast is shown
   * (Requirement 1.6).
   *
   * @param {string} name
   * @param {string|number} amount
   * @param {string} category
   * @returns {boolean} true if the transaction was added, false otherwise.
   */
  function add(name, amount, category) {
    // Clear any previous inline field errors
    if (typeof RenderModule !== 'undefined' && RenderModule.clearFieldErrors) {
      RenderModule.clearFieldErrors();
    }

    const { valid, errors } = ValidatorModule.validateTransaction(name, amount);

    if (!valid) {
      // Show inline errors adjacent to the offending fields
      if (typeof RenderModule !== 'undefined' && RenderModule.showFieldError) {
        errors.forEach((msg) => {
          // Determine which field the error belongs to so we can target it
          const isNameError =
            msg.includes('name') || msg.includes('Name');
          const field = isNameError ? 'item-name' : 'amount';
          RenderModule.showFieldError(field, msg);
        });
      }
      return false;
    }

    const transaction = {
      id:        crypto.randomUUID(),
      name:      name.toString().trim(),
      amount:    parseFloat(amount),
      category:  category,
      createdAt: Date.now(),
    };

    // Tentatively add to AppState so save() serializes the full list
    AppState.transactions.push(transaction);

    const saved = StorageModule.save();

    if (!saved) {
      // Roll back — Storage rejected the write (Requirement 1.6)
      AppState.transactions.pop();
      if (typeof RenderModule !== 'undefined' && RenderModule.showError) {
        RenderModule.showError(
          'Your changes could not be saved. The transaction was not added.'
        );
      }
      return false;
    }

    // Re-render the full UI
    if (typeof RenderModule !== 'undefined' && RenderModule.renderAll) {
      RenderModule.renderAll();
    }

    // Reset form fields after a successful add (Requirement 1.3)
    _resetForm();

    return true;
  }

  /**
   * Delete a transaction by id.
   *
   * If not yet confirmed, prompts the user via the browser confirm dialog.
   * On confirmation: removes the transaction from AppState, persists to Storage.
   * If Storage.save() fails: shows toast and restores the transaction
   * (Requirement 3.5).
   *
   * @param {string} id - UUID of the transaction to delete.
   * @param {boolean} [confirmed=false] - Pass true to skip the confirm dialog.
   * @returns {boolean} true if deleted, false if cancelled or save failed.
   */
  function del(id, confirmed = false) {
    if (!confirmed) {
      const proceed = window.confirm(
        'Are you sure you want to delete this transaction?'
      );
      if (!proceed) {
        return false; // User cancelled (Requirement 3.4)
      }
    }

    const index = AppState.transactions.findIndex((t) => t.id === id);
    if (index === -1) {
      return false; // Transaction not found — nothing to do
    }

    // Remove from AppState tentatively
    const [removed] = AppState.transactions.splice(index, 1);

    const saved = StorageModule.save();

    if (!saved) {
      // Roll back — put the transaction back at its original position (Requirement 3.5)
      AppState.transactions.splice(index, 0, removed);
      if (typeof RenderModule !== 'undefined' && RenderModule.showError) {
        RenderModule.showError(
          'Deletion failed — please try again.'
        );
      }
      return false;
    }

    // Re-render balance, list, and chart (Requirement 3.6)
    if (typeof RenderModule !== 'undefined' && RenderModule.renderAll) {
      RenderModule.renderAll();
    }

    return true;
  }

  /**
   * Reset Input_Form fields after a successful transaction add.
   * Clears name, amount, and resets category selector to the first option.
   */
  function _resetForm() {
    const nameField     = document.getElementById('transaction-name');
    const amountField   = document.getElementById('transaction-amount');
    const categoryField = document.getElementById('transaction-category');

    if (nameField)     nameField.value = '';
    if (amountField)   amountField.value = '';
    if (categoryField) categoryField.selectedIndex = 0;
  }

  return { add, delete: del };
})();

/* =============================================================================
   SECTION 7: Sort Module
   ============================================================================= */

const SortModule = (() => {
  /**
   * Return a sorted copy of the transactions array according to the given option.
   * This is a pure function — the input array is never mutated.
   *
   * Sort options:
   *   'amount_asc'   — ascending by amount; tiebreak: date descending
   *   'amount_desc'  — descending by amount; tiebreak: date descending
   *   'category_asc' — alphabetical (case-insensitive) by category; tiebreak: date descending
   *   null           — date descending (default display order)
   *
   * @param {Array<{id: string, name: string, amount: number, category: string, createdAt: number}>} transactions
   * @param {'amount_asc'|'amount_desc'|'category_asc'|null} option
   * @returns {Array<{id: string, name: string, amount: number, category: string, createdAt: number}>}
   */
  function apply(transactions, option) {
    // Shallow copy so the original array is never mutated (pure function requirement)
    const copy = [...transactions];

    /**
     * Tiebreaker: date descending (more recent first).
     * Used when the primary sort key is equal for two transactions.
     *
     * @param {object} a
     * @param {object} b
     * @returns {number}
     */
    function tiebreakDateDesc(a, b) {
      return b.createdAt - a.createdAt;
    }

    switch (option) {
      case SORT_OPTIONS.AMOUNT_ASC:
        copy.sort((a, b) => {
          const diff = a.amount - b.amount;
          return diff !== 0 ? diff : tiebreakDateDesc(a, b);
        });
        break;

      case SORT_OPTIONS.AMOUNT_DESC:
        copy.sort((a, b) => {
          const diff = b.amount - a.amount;
          return diff !== 0 ? diff : tiebreakDateDesc(a, b);
        });
        break;

      case SORT_OPTIONS.CATEGORY_ASC:
        copy.sort((a, b) => {
          const catA = a.category.toLowerCase();
          const catB = b.category.toLowerCase();
          if (catA < catB) return -1;
          if (catA > catB) return  1;
          return tiebreakDateDesc(a, b);
        });
        break;

      default:
        // null or any unknown value → date descending
        copy.sort(tiebreakDateDesc);
        break;
    }

    return copy;
  }

  return { apply };
})();

/* =============================================================================
   SECTION 8: Chart Module
   Wraps Chart.js. Maintains a single Chart instance in AppState.chartInstance.
   Colors are assigned deterministically per category name so the same category
   always gets the same color across re-renders.
   ============================================================================= */

const ChartModule = (() => {
  // ---------------------------------------------------------------------------
  // Stable color palette (12 visually distinct colors).
  // Assignment is deterministic: we hash the category name to an index so the
  // same label always maps to the same color, regardless of insertion order.
  // ---------------------------------------------------------------------------
  const COLOR_PALETTE = [
    '#4e79a7', // blue
    '#f28e2b', // orange
    '#e15759', // red
    '#76b7b2', // teal
    '#59a14f', // green
    '#edc948', // yellow
    '#b07aa1', // purple
    '#ff9da7', // pink
    '#9c755f', // brown
    '#bab0ac', // gray
    '#d37295', // magenta
    '#a0cbe8', // light blue
  ];

  /**
   * Deterministic color assignment: hash the category name to a palette index.
   * The same string always produces the same color.
   *
   * @param {string} category
   * @returns {string} hex color string
   */
  function _colorForCategory(category) {
    let hash = 0;
    for (let i = 0; i < category.length; i++) {
      // Simple djb2-style hash
      hash = (hash * 31 + category.charCodeAt(i)) >>> 0; // keep unsigned 32-bit
    }
    return COLOR_PALETTE[hash % COLOR_PALETTE.length];
  }

  /**
   * Derive chart data from a list of transactions.
   * Groups positive-amount transactions by category, sums amounts per group,
   * and returns Chart.js-compatible labels, data, and backgroundColor arrays.
   *
   * @param {Array} transactions
   * @returns {{ labels: string[], amounts: number[], colors: string[] }}
   */
  function _deriveChartData(transactions) {
    /** @type {Map<string, number>} */
    const totals = new Map();

    for (const tx of transactions) {
      if (tx.amount > 0) {
        totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amount);
      }
    }

    const labels  = [];
    const amounts = [];
    const colors  = [];

    // Iterate in insertion order so the chart is deterministic for a given state
    for (const [category, total] of totals.entries()) {
      labels.push(category);
      amounts.push(Math.round(total * 100) / 100); // round to 2 dp
      colors.push(_colorForCategory(category));
    }

    return { labels, amounts, colors };
  }

  /**
   * Create a new Chart.js instance on the given canvas element.
   * Stores the reference in AppState.chartInstance.
   * Call this once after the DOM is ready.
   *
   * @param {HTMLCanvasElement} canvasEl
   */
  function init(canvasEl) {
    if (AppState.chartInstance) {
      // Avoid double-initialisation
      AppState.chartInstance.destroy();
      AppState.chartInstance = null;
    }

    AppState.chartInstance = new Chart(canvasEl, {
      type: 'doughnut',
      data: {
        labels:   [],
        datasets: [{
          data:            [],
          backgroundColor: [],
          borderWidth:     2,
          borderColor:     '#fff',
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display:  true,
            position: 'bottom',
            labels: {
              padding:   16,
              boxWidth:  14,
              font:      { size: 13 },
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const total = context.dataset.data.reduce((s, v) => s + v, 0);
                const pct   = total > 0
                  ? ((context.parsed / total) * 100).toFixed(1)
                  : '0.0';
                return ` ${context.label}: ${context.parsed.toFixed(2)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * Recompute chart data from the current transactions and update the chart.
   * Handles the empty-state toggle (canvas vs. #chart-empty-state).
   *
   * @param {Array} transactions — full list from AppState.transactions
   */
  function update(transactions) {
    const { labels, amounts, colors } = _deriveChartData(transactions);

    const canvasEl    = document.getElementById('spending-chart');
    const emptyStateEl = document.getElementById('chart-empty-state');

    const hasData = labels.length > 0;

    // Toggle visibility between chart canvas and empty-state message
    if (canvasEl)     canvasEl.style.display     = hasData ? ''      : 'none';
    if (emptyStateEl) emptyStateEl.style.display = hasData ? 'none'  : '';

    if (!AppState.chartInstance) {
      return; // Chart not yet initialised — nothing more to do
    }

    // Update chart data in-place and call chart.update() (avoids full recreation)
    const dataset = AppState.chartInstance.data.datasets[0];

    AppState.chartInstance.data.labels  = labels;
    dataset.data                        = amounts;
    dataset.backgroundColor             = colors;

    AppState.chartInstance.update();
  }

  /**
   * Destroy the Chart.js instance and clear the AppState reference.
   * Call before removing the canvas element from the DOM.
   */
  function destroy() {
    if (AppState.chartInstance) {
      AppState.chartInstance.destroy();
      AppState.chartInstance = null;
    }
  }

  return { init, update, destroy };
})();

/* =============================================================================
   SECTION 9: Theme Module
   ============================================================================= */

const ThemeModule = (() => {
  /**
   * Labels and icons for each theme state.
   * Shown inside the #theme-toggle button.
   */
  const THEME_META = {
    light: { label: 'Dark mode',  icon: '🌙' },
    dark:  { label: 'Light mode', icon: '☀️' },
  };

  /**
   * Apply a theme to the document, update AppState, update the toggle button
   * UI, and persist to Storage.
   *
   * Sets `document.documentElement.dataset.theme` so every CSS custom-property
   * rule scoped to `[data-theme="..."]` reacts immediately.
   *
   * @param {'light'|'dark'} theme
   */
  function apply(theme) {
    // Normalise — fall back to 'light' for any unexpected value
    const safeTheme = theme === 'dark' ? 'dark' : 'light';

    // 1. Apply to DOM (triggers CSS custom-property cascade)
    document.documentElement.dataset.theme = safeTheme;

    // 2. Update in-memory state
    AppState.theme = safeTheme;

    // 3. Update toggle button aria + visible content
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      const meta = THEME_META[safeTheme];

      // aria-pressed: true while dark mode is active
      toggleBtn.setAttribute('aria-pressed', safeTheme === 'dark' ? 'true' : 'false');

      const labelEl = toggleBtn.querySelector('.theme-toggle-label');
      if (labelEl) labelEl.textContent = meta.label;

      const iconEl = toggleBtn.querySelector('.theme-toggle-icon');
      if (iconEl) iconEl.textContent = meta.icon;
    }

    // 4. Persist (Requirement 9.5)
    StorageModule.save();
  }

  /**
   * Toggle between 'light' and 'dark', then apply the new theme.
   * (Requirement 9.1, 9.2)
   */
  function toggle() {
    const nextTheme = AppState.theme === 'dark' ? 'light' : 'dark';
    apply(nextTheme);
  }

  /**
   * Load the saved theme from AppState (already hydrated from Storage by Init)
   * and apply it to the document.
   *
   * If no valid theme is present in AppState (Storage was unavailable or
   * returned null), silently defaults to 'light' — no error toast shown
   * (Requirement 9.3, 9.6).
   */
  function load() {
    // AppState.theme was set to the persisted value (or left as the default
    // 'light') during the Init bootstrap before ThemeModule.load() is called.
    const savedTheme = AppState.theme;
    const resolved   = savedTheme === 'dark' ? 'dark' : 'light';
    apply(resolved);
  }

  return { apply, toggle, load };
})();

/* =============================================================================
   SECTION 10: Render Module
   All DOM writes live here. Each function reads exclusively from AppState.
   No module other than RenderModule should write to the DOM.
   ============================================================================= */

const RenderModule = (() => {
  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Format a numeric amount to 2 decimal places with a leading currency symbol.
   * Negative values are returned as "-$X.XX" (ASCII minus used for arithmetic
   * display; the balance display prefixes with the Unicode minus sign separately).
   *
   * @param {number} amount
   * @returns {string}
   */
  function _formatAmount(amount) {
    return '$' + Math.abs(amount).toFixed(2);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Recalculate and display the running total balance.
   *
   * All transactions are stored as positive floats per the design, so every
   * transaction is treated as an expense (subtracted). The spec leaves room for
   * income entries (positive additions) but the current model stores only
   * expenses, so we sum all amounts and treat the total as a net expense.
   *
   * Per Requirement 4.1 the display is the net sum; per 4.4 the zero-state is
   * "$0.00"; per 4.5 a negative net is prefixed with a minus sign.
   *
   * Requirements: 4.1, 4.3, 4.4, 4.5
   */
  function renderBalance() {
    const el = document.getElementById('balance-display');
    if (!el) return;

    // Sum all transaction amounts
    const total = AppState.transactions.reduce(
      (sum, tx) => sum + tx.amount,
      0
    );

    // Round to 2 decimal places to eliminate floating-point noise
    const rounded = Math.round(total * 100) / 100;

    if (rounded < 0) {
      el.textContent = '\u2212$' + Math.abs(rounded).toFixed(2); // Unicode minus
      el.classList.add('negative');
    } else {
      el.textContent = '$' + rounded.toFixed(2);
      el.classList.remove('negative');
    }
  }

  /**
   * Rebuild the transaction list entirely from AppState, applying the active
   * sort option via SortModule.
   *
   * Each <li> shows:
   *   - item name
   *   - formatted amount ($X.XX)
   *   - category label
   *   - a delete button (data-action="delete", data-id=<uuid>)
   *
   * When the list is empty the empty-state <li> is shown instead.
   *
   * Requirements: 2.1, 2.3, 2.4, 3.1, 8.2, 8.5
   */
  function renderList() {
    const listEl = document.getElementById('transaction-list');
    if (!listEl) return;

    // Clear current children
    listEl.innerHTML = '';

    const sorted = SortModule.apply(AppState.transactions, AppState.sortOption);

    if (sorted.length === 0) {
      // Empty-state message (Requirement 2.4)
      const emptyLi = document.createElement('li');
      emptyLi.id = 'transaction-empty-state';
      emptyLi.className = 'empty-state list-empty';
      emptyLi.textContent =
        'No transactions recorded yet. Add one above to get started.';
      listEl.appendChild(emptyLi);
      return;
    }

    sorted.forEach((tx) => {
      const li = document.createElement('li');
      li.className = 'transaction-item';
      li.dataset.id = tx.id;

      // Transaction info container
      const infoDiv = document.createElement('div');
      infoDiv.className = 'transaction-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'transaction-name';
      nameSpan.textContent = tx.name;

      const categorySpan = document.createElement('span');
      categorySpan.className = 'transaction-category';
      categorySpan.textContent = tx.category;

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(categorySpan);

      // Amount
      const amountSpan = document.createElement('span');
      amountSpan.className = 'transaction-amount';
      amountSpan.textContent = _formatAmount(tx.amount);

      // Delete button (event delegation via data-action on the list)
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-danger transaction-delete';
      deleteBtn.dataset.action = 'delete';
      deleteBtn.dataset.id = tx.id;
      deleteBtn.setAttribute('aria-label', `Delete transaction: ${tx.name}`);
      deleteBtn.textContent = 'Delete';

      li.appendChild(infoDiv);
      li.appendChild(amountSpan);
      li.appendChild(deleteBtn);

      listEl.appendChild(li);
    });
  }

  /**
   * Delegate to ChartModule to recompute and re-render the pie/doughnut chart.
   * Requirements: 5.2, 5.4
   */
  function renderChart() {
    ChartModule.update(AppState.transactions);
  }

  /**
   * Rebuild the category <select> options from the merged list of default and
   * custom categories. Preserves the currently selected value if it still exists
   * after the rebuild.
   *
   * Requirements: 7.1, 7.2, 7.5, 1.1
   */
  function renderCategorySelector() {
    const selectEl = document.getElementById('transaction-category');
    if (!selectEl) return;

    // Remember the currently selected value so we can restore it if possible
    const previousValue = selectEl.value;

    // Clear and rebuild options
    selectEl.innerHTML = '';

    const allCategories = [
      ...DEFAULT_CATEGORIES,
      ...AppState.categories.filter((c) => !DEFAULT_CATEGORIES.includes(c)),
    ];

    allCategories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      selectEl.appendChild(option);
    });

    // Restore previously selected value if it still exists, otherwise keep first
    if (previousValue && allCategories.includes(previousValue)) {
      selectEl.value = previousValue;
    }
  }

  /**
   * Reflect the active sort option in the Sort_Control <select> and update the
   * visible sort indicator span.
   *
   * When sortOption is null the select shows the default "Date (newest first)"
   * option and the indicator span is cleared.
   *
   * Requirements: 8.5
   */
  function renderSortIndicator() {
    const sortSelectEl = document.getElementById('sort-select');
    const indicatorEl  = document.getElementById('sort-indicator');

    if (sortSelectEl) {
      sortSelectEl.value = AppState.sortOption ?? '';
    }

    if (indicatorEl) {
      const labels = {
        amount_asc:   'Sorted: Amount (Low to High)',
        amount_desc:  'Sorted: Amount (High to Low)',
        category_asc: 'Sorted: Category (A–Z)',
      };
      indicatorEl.textContent = AppState.sortOption
        ? labels[AppState.sortOption] ?? ''
        : '';
    }
  }

  /**
   * Call all five render sub-functions in the correct order.
   * This is the primary entry point after any AppState mutation.
   *
   * Requirements: 2.3, 3.6, 4.3, 5.2
   */
  function renderAll() {
    renderBalance();
    renderList();
    renderChart();
    renderCategorySelector();
    renderSortIndicator();
  }

  /**
   * Create and display a non-blocking toast error message.
   *
   * Toasts:
   *   - Appear in #toast-container (fixed top-right overlay)
   *   - Auto-dismiss after 5 000 ms
   *   - Stack if multiple are active simultaneously
   *   - Each has a manual dismiss button
   *
   * Requirements: 6.4, 6.5, 1.6, 3.5
   *
   * @param {string} message
   */
  function showError(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.textContent = message;

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'toast-dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss notification');
    dismissBtn.textContent = '\u00D7'; // ×

    // Dismiss handler: add .dismissing for animation, then remove from DOM
    function dismiss() {
      toast.classList.add('dismissing');
      toast.addEventListener(
        'animationend',
        () => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        },
        { once: true }
      );
      // Fallback removal after 500 ms in case animationend never fires
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 500);
    }

    dismissBtn.addEventListener('click', dismiss);

    toast.appendChild(msgSpan);
    toast.appendChild(dismissBtn);
    container.appendChild(toast);

    // Auto-dismiss after 5 000 ms (Requirement toast design)
    setTimeout(dismiss, 5000);
  }

  /**
   * Display an inline error message adjacent to a specific form field.
   *
   * The `fieldId` parameter is the logical field identifier used by the calling
   * module. This function maps logical names to the actual HTML error span IDs:
   *
   *   'item-name'  → #transaction-name-error  (input: #transaction-name)
   *   'amount'     → #transaction-amount-error (input: #transaction-amount)
   *   'category'   → #transaction-category-error
   *   'category-name' → #category-name-error   (input: #category-name)
   *
   * Requirements: 1.4, 1.5, 7.3, 7.4
   *
   * @param {string} fieldId  - Logical field identifier
   * @param {string} message  - Error text to display
   */
  function showFieldError(fieldId, message) {
    // Map logical field IDs → actual HTML element IDs
    const ID_MAP = {
      'item-name':    { error: 'transaction-name-error',   input: 'transaction-name' },
      'amount':       { error: 'transaction-amount-error', input: 'transaction-amount' },
      'category':     { error: 'transaction-category-error', input: 'transaction-category' },
      'category-name':{ error: 'category-name-error',      input: 'category-name' },
      // Allow callers to pass the actual IDs directly too
      'transaction-name':     { error: 'transaction-name-error',     input: 'transaction-name' },
      'transaction-amount':   { error: 'transaction-amount-error',   input: 'transaction-amount' },
      'transaction-category': { error: 'transaction-category-error', input: 'transaction-category' },
    };

    const mapping = ID_MAP[fieldId] ?? { error: `${fieldId}-error`, input: fieldId };

    const errorSpan = document.getElementById(mapping.error);
    if (errorSpan) {
      errorSpan.textContent = message;
    }

    const inputEl = document.getElementById(mapping.input);
    if (inputEl) {
      inputEl.classList.add('has-error');
    }
  }

  /**
   * Clear all inline field errors across both forms.
   * Resets text content of every .field-error span and removes the has-error
   * class from all inputs/selects in the forms.
   *
   * Requirements: 1.4, 1.5
   *
   * @param {string} [scope] - Optional: specific field ID to clear (logical name).
   *                           If omitted, all field errors are cleared.
   */
  function clearFieldErrors(scope) {
    if (scope) {
      // Clear only the specific field
      showFieldError(scope, '');
      // Remove has-error class
      const ID_MAP = {
        'item-name':     'transaction-name',
        'amount':        'transaction-amount',
        'category':      'transaction-category',
        'category-name': 'category-name',
      };
      const inputId = ID_MAP[scope] ?? scope;
      const inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.classList.remove('has-error');
      return;
    }

    // Clear all field error spans
    document.querySelectorAll('.field-error').forEach((span) => {
      span.textContent = '';
    });

    // Remove has-error from all form inputs/selects
    document.querySelectorAll('.form-input.has-error, .form-select.has-error').forEach(
      (el) => el.classList.remove('has-error')
    );
  }

  return {
    renderBalance,
    renderList,
    renderChart,
    renderCategorySelector,
    renderSortIndicator,
    renderAll,
    showError,
    showFieldError,
    clearFieldErrors,
  };
})();

/* =============================================================================
   SECTION 11: Init — DOMContentLoaded bootstrap
   Bootstraps the application after the DOM is fully parsed.
   Requirements: 6.3, 8.2, 8.3, 8.4, 9.3, 10.2, 10.3, 10.4
   ============================================================================= */

// ---------------------------------------------------------------------------
// Global error safety net — catches unhandled exceptions and rejected promises.
// Logs to console, shows a toast, and does NOT mutate AppState (Req 10.4).
// ---------------------------------------------------------------------------
window.onerror = function globalErrorHandler(message, source, lineno, colno, error) {
  console.error('[EBV] Unhandled error:', message, 'at', source, lineno, colno, error);
  if (typeof RenderModule !== 'undefined' && RenderModule.showError) {
    RenderModule.showError('An unexpected error occurred.');
  }
  // Return false so the browser still logs the error in the console normally
  return false;
};

window.addEventListener('unhandledrejection', function globalRejectionHandler(event) {
  console.error('[EBV] Unhandled promise rejection:', event.reason);
  if (typeof RenderModule !== 'undefined' && RenderModule.showError) {
    RenderModule.showError('An unexpected error occurred.');
  }
});

// ---------------------------------------------------------------------------
// DOMContentLoaded — entry point
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function init() {
  // -------------------------------------------------------------------------
  // 1. Load persisted data from Storage
  // -------------------------------------------------------------------------
  const loaded = StorageModule.load();

  // -------------------------------------------------------------------------
  // 2. Hydrate AppState — merge loaded data with defaults
  // -------------------------------------------------------------------------

  // Transactions: use persisted array if valid, otherwise start empty
  AppState.transactions =
    Array.isArray(loaded.transactions) ? loaded.transactions : [];

  // Categories: always prepend the three built-in defaults, then append any
  // saved custom categories (DEFAULT_CATEGORIES are never written to Storage,
  // so 'loaded.categories' contains custom names only)
  const customCategories = Array.isArray(loaded.categories) ? loaded.categories : [];
  AppState.categories = [...DEFAULT_CATEGORIES, ...customCategories];

  // Theme: only recognise 'dark' as a valid stored value; anything else → light
  AppState.theme = loaded.theme === 'dark' ? 'dark' : 'light';

  // Sort option always resets to null on load (default order: date desc)
  AppState.sortOption = null;

  // -------------------------------------------------------------------------
  // 3. Apply persisted theme to the document (Requirement 9.3)
  // -------------------------------------------------------------------------
  ThemeModule.load();

  // -------------------------------------------------------------------------
  // 4. Initialise Chart.js on the canvas element (Requirement 5.1)
  // -------------------------------------------------------------------------
  const canvasEl = document.getElementById('spending-chart');
  if (canvasEl) {
    ChartModule.init(canvasEl);
  }

  // -------------------------------------------------------------------------
  // 5. Perform initial full render (Requirement 6.3)
  // -------------------------------------------------------------------------
  RenderModule.renderAll();

  // -------------------------------------------------------------------------
  // 6. Wire DOM event listeners
  // -------------------------------------------------------------------------

  // --- Add Transaction form submit -----------------------------------------
  const transactionForm = document.getElementById('transaction-form');
  if (transactionForm) {
    transactionForm.addEventListener('submit', function handleTransactionSubmit(event) {
      event.preventDefault();

      const name     = document.getElementById('transaction-name')?.value ?? '';
      const amount   = document.getElementById('transaction-amount')?.value ?? '';
      const category = document.getElementById('transaction-category')?.value ?? '';

      TransactionModule.add(name, amount, category);
    });
  }

  // --- Add Custom Category form submit -------------------------------------
  const categoryForm = document.getElementById('category-form');
  if (categoryForm) {
    categoryForm.addEventListener('submit', function handleCategorySubmit(event) {
      event.preventDefault();

      const nameInput = document.getElementById('category-name');
      const name = nameInput?.value ?? '';

      const added = CategoryModule.add(name);

      // Clear the input field after a successful addition
      if (added && nameInput) {
        nameInput.value = '';
      }
    });
  }

  // --- Sort Control change -------------------------------------------------
  // Requirements: 8.2, 8.3, 8.4
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function handleSortChange(event) {
      // An empty string means the default "Date (newest first)" option is selected
      const selectedValue = event.target.value;
      AppState.sortOption = selectedValue || null;

      RenderModule.renderList();
      RenderModule.renderSortIndicator();
    });
  }

  // --- Theme toggle click --------------------------------------------------
  // Requirement 9.1, 9.2, 9.5
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function handleThemeToggle() {
      ThemeModule.toggle();
    });
  }

  // --- Transaction list — delete button (event delegation) ----------------
  // Requirements: 3.2, 3.3, 3.4
  // We listen on the list container rather than individual buttons so that
  // newly rendered items are automatically covered without re-binding.
  const transactionList = document.getElementById('transaction-list');
  if (transactionList) {
    transactionList.addEventListener('click', function handleListClick(event) {
      // Walk up from the clicked element to find a [data-action="delete"] element.
      // This handles cases where the user clicks a child element inside the button.
      const deleteBtn = event.target.closest('[data-action="delete"]');
      if (!deleteBtn) {
        return; // Click was not on a delete control
      }

      const id = deleteBtn.dataset.id;
      if (id) {
        TransactionModule.delete(id);
      }
    });
  }

  // --- Clear inline field errors when the user starts editing a field ------
  // Provides immediate feedback that the error has been acknowledged
  // (Requirements 1.4, 1.5, 7.3, 7.4)
  ['transaction-name', 'transaction-amount', 'transaction-category'].forEach((inputId) => {
    const el = document.getElementById(inputId);
    if (el) {
      el.addEventListener('input', function clearOnEdit() {
        RenderModule.clearFieldErrors(
          inputId === 'transaction-name'     ? 'item-name' :
          inputId === 'transaction-amount'   ? 'amount'    :
          'category'
        );
      });
    }
  });

  const categoryNameInput = document.getElementById('category-name');
  if (categoryNameInput) {
    categoryNameInput.addEventListener('input', function clearCategoryError() {
      RenderModule.clearFieldErrors('category-name');
    });
  }
});
