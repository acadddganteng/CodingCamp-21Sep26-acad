# Requirements Document

## Introduction

The Expense & Budget Visualizer is a client-side web application that allows users to track personal expenses and visualize their spending distribution. Users can add transactions with a name, amount, and category; view a running total balance; see a pie chart of spending by category; delete transactions; sort transactions; add custom categories; and toggle between dark and light display modes. All data is persisted exclusively in the browser's Local Storage with no backend server required. The application is built with HTML, CSS, and Vanilla JavaScript, and delivered as a standalone web page or browser extension.

---

## Glossary

- **App**: The Expense & Budget Visualizer web application.
- **Transaction**: A single expense record consisting of an item name, a monetary amount, and a category.
- **Transaction_List**: The scrollable on-screen list displaying all recorded Transactions.
- **Category**: A label grouping Transactions by spending type (e.g., Food, Transport, Fun, or a user-defined custom label).
- **Custom_Category**: A Category created by the user that is not one of the three default categories (Food, Transport, Fun).
- **Input_Form**: The HTML form element containing fields for item name, amount, and category selection used to create a new Transaction.
- **Validator**: The client-side logic component responsible for checking that all required Input_Form fields contain valid data before a Transaction is added.
- **Balance_Display**: The UI element at the top of the App that shows the current total of all Transaction amounts.
- **Chart**: The pie chart rendered by Chart.js that shows the proportional spending distribution across Categories.
- **Storage**: The browser's Local Storage API used to persist Transaction and Category data between sessions.
- **Theme**: The visual color scheme of the App — either light mode or dark mode.
- **Sort_Control**: The UI control that allows the user to reorder the Transaction_List by amount or by category.

---

## Requirements

### Requirement 1: Add a Transaction

**User Story:** As a user, I want to submit an expense through a form, so that I can record my spending.

#### Acceptance Criteria

1. THE Input_Form SHALL present a text field for item name accepting up to 100 characters, a numeric field for amount accepting values from 0.01 to 999,999,999.99 with up to 2 decimal places, and a category selector containing at least the default options Food, Transport, and Fun plus any saved Custom_Categories.
2. WHEN the user submits the Input_Form with all fields filled and the amount greater than zero, THE App SHALL add a new Transaction to the Transaction_List and persist it to Storage.
3. WHEN the user submits the Input_Form with all fields filled and the amount greater than zero, THE Input_Form SHALL reset the item name field to empty, the amount field to empty, and the category selector to the first default option after the Transaction is added.
4. IF the user submits the Input_Form with one or more fields empty, THEN THE Validator SHALL display an inline error message identifying each empty field and SHALL NOT add a Transaction.
5. IF the user submits the Input_Form with an amount that is zero, negative, non-numeric, or contains more than 2 decimal places, THEN THE Validator SHALL display an inline error message indicating the amount is invalid and SHALL NOT add a Transaction.
6. IF Storage is unavailable when the App attempts to persist a Transaction, THEN THE App SHALL display an error message indicating the Transaction could not be saved and SHALL NOT add the Transaction to the Transaction_List.

---

### Requirement 2: Display the Transaction List

**User Story:** As a user, I want to see all my recorded expenses in a scrollable list, so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display each Transaction showing the item name (maximum 100 characters), the monetary amount formatted to two decimal places with the currency symbol configured in the application settings, and the Category label, ordered from most recent to oldest by creation date.
2. WHEN the number of Transactions displayed in the Transaction_List exceeds the visible viewport height allocated to the list, THE Transaction_List SHALL provide vertical scrolling to reach all Transactions.
3. WHEN a Transaction is added or deleted, THE Transaction_List SHALL update its displayed items within 100 milliseconds without requiring a page reload.
4. WHEN no Transactions exist, THE Transaction_List SHALL display a message indicating that no transactions have been recorded yet.

---

### Requirement 3: Delete a Transaction

**User Story:** As a user, I want to remove an individual transaction from the list, so that I can correct mistakes or remove outdated entries.

#### Acceptance Criteria

1. THE Transaction_List SHALL display a delete control for each Transaction.
2. WHEN the user activates the delete control for a Transaction, THE App SHALL request confirmation from the user before proceeding with the deletion.
3. IF the user confirms the deletion, THEN THE App SHALL remove that Transaction from the Transaction_List and from Storage.
4. IF the user cancels the deletion, THEN THE App SHALL dismiss the confirmation and leave the Transaction_List and Storage unchanged.
5. IF Storage fails to remove the Transaction, THEN THE App SHALL display an error message indicating the deletion failed and leave the Transaction visible in the Transaction_List.
6. WHEN the user confirms the deletion of a Transaction, THE Balance_Display and THE Chart SHALL update to reflect the removal within 100 milliseconds.

---

### Requirement 4: Display Total Balance

**User Story:** As a user, I want to see my total spending at a glance, so that I can monitor how much I have spent overall.

#### Acceptance Criteria

1. THE Balance_Display SHALL present the net sum of all Transaction amounts, where expense Transactions are subtracted and income Transactions are added, formatted to exactly two decimal places with the currency symbol derived from the Transaction currency.
2. THE Balance_Display SHALL be positioned at the top of the App and remain visible without scrolling.
3. WHEN a Transaction is added, edited, or deleted, THE Balance_Display SHALL recalculate and display the updated total within 100 milliseconds.
4. WHILE no Transactions exist, THE Balance_Display SHALL show a balance of 0.00.
5. IF the net balance is negative, THE Balance_Display SHALL prefix the formatted amount with a minus sign.

---

### Requirement 5: Visualize Spending by Category

**User Story:** As a user, I want to see a pie chart of my spending by category, so that I can understand where my money is going.

#### Acceptance Criteria

1. THE Chart SHALL render a pie chart where each slice represents one Category containing at least one Transaction with an amount greater than zero, sized proportionally to that Category's share of the total sum of all positive-amount Transaction amounts.
2. WHEN a Transaction is added, edited, or deleted, THE Chart SHALL re-render to reflect the updated spending distribution within 100 milliseconds.
3. THE Chart SHALL display a unique color per Category slice such that no two slices share the same color, and a legend identifying each Category label alongside its corresponding color.
4. WHILE no Transactions with an amount greater than zero exist, THE Chart SHALL display an empty state message indicating that no data is available.

---

### Requirement 6: Persist Data Across Sessions

**User Story:** As a user, I want my transactions and categories to be saved between visits, so that I do not have to re-enter data every time I open the App.

#### Acceptance Criteria

1. WHEN a Transaction is added or deleted, THE Storage SHALL be updated immediately so the change is durable across browser sessions.
2. WHEN a Custom_Category is added or deleted, THE Storage SHALL be updated immediately so the change is durable across browser sessions.
3. WHEN the App is loaded, THE App SHALL read all previously saved Transactions and Custom_Categories from Storage and restore them to the Transaction_List, Category selector, Balance_Display, and Chart within 2 seconds.
4. IF Storage contains corrupted or unparseable data, THEN THE App SHALL display a non-blocking warning message indicating data could not be loaded, discard the corrupted data from Storage, and initialize with an empty Transaction_List and default Category list.
5. IF Storage is unavailable or write access is denied, THEN THE App SHALL display a non-blocking warning message indicating that changes will not be persisted, and continue operating with in-memory data for the current session.

---

### Requirement 7: Add Custom Categories

**User Story:** As a user, I want to define my own expense categories, so that I can organize my spending in a way that fits my lifestyle.

#### Acceptance Criteria

1. THE App SHALL provide a dedicated input field, accepting between 1 and 50 characters, and a submit control that allows the user to create a Custom_Category with a non-empty, unique name.
2. WHEN the user submits a valid Custom_Category name, THE App SHALL add the Custom_Category to the category selector in the Input_Form and persist it to Storage within 2 seconds.
3. IF the user submits an empty name or a name that duplicates an existing Category (case-insensitive), THEN THE Validator SHALL display an inline error message indicating the specific reason (empty or duplicate) and SHALL NOT add the Custom_Category to the category selector or Storage.
4. WHEN the user submits a Custom_Category name exceeding 50 characters, THE Validator SHALL display an inline error message indicating the name is too long and SHALL NOT add the Custom_Category to the category selector or Storage.
5. WHEN the App is loaded, THE App SHALL restore all previously saved Custom_Categories from Storage and include them in the category selector within 2 seconds.

---

### Requirement 8: Sort Transactions

**User Story:** As a user, I want to sort my transaction list by amount or by category, so that I can quickly find and compare entries.

#### Acceptance Criteria

1. THE Sort_Control SHALL offer at minimum the following sort options: amount ascending, amount descending, and category ascending (alphabetical).
2. WHEN the user selects a sort option, THE Transaction_List SHALL reorder all displayed Transactions according to the selected criterion within 100 milliseconds, with Transactions that share the same criterion value ordered by date descending as a tiebreaker.
3. WHEN a new Transaction is added WHILE a sort option is active, THE Transaction_List SHALL insert the new Transaction in the position determined by the active sort criterion.
4. WHEN an existing Transaction is deleted WHILE a sort option is active, THE Transaction_List SHALL reorder the remaining Transactions to maintain the active sort criterion.
5. THE Sort_Control SHALL display a visible indicator (such as a label, icon, or highlight) on the currently active sort option that is absent from all inactive sort options.
6. WHEN the Transaction_List is first displayed, THE Transaction_List SHALL apply a default sort order of date descending with no sort option marked as active in the Sort_Control.

---

### Requirement 9: Toggle Dark and Light Mode

**User Story:** As a user, I want to switch between a dark and a light color scheme, so that I can use the App comfortably in different lighting conditions.

#### Acceptance Criteria

1. THE App SHALL provide a toggle control that switches the Theme between light mode and dark mode, and the toggle control SHALL reflect the currently active Theme at all times.
2. WHEN the user activates the Theme toggle, THE App SHALL apply the selected Theme to all visible UI elements within 100 milliseconds.
3. WHEN the App is loaded, THE App SHALL restore the previously selected Theme from Storage; IF no Theme preference has been saved in Storage, THEN THE App SHALL apply the light mode Theme by default.
4. THE App SHALL maintain a color contrast ratio of at least 4.5:1 between text and background in both light mode and dark mode Themes to meet WCAG 2.1 AA accessibility guidelines.
5. WHEN the user activates the Theme toggle, THE App SHALL save the selected Theme to Storage so the preference persists across sessions.
6. IF Storage is unavailable when the App is loaded, THEN THE App SHALL silently fall back to light mode without displaying an error.

---

### Requirement 10: Code and File Structure

**User Story:** As a developer, I want the codebase to follow a consistent file structure, so that the project is easy to maintain and extend.

#### Acceptance Criteria

1. THE App SHALL consist of exactly one HTML file, exactly one CSS file located inside a `css/` directory, and exactly one JavaScript file located inside a `js/` directory.
2. THE App SHALL load and render correctly in the latest stable versions of Chrome, Firefox, Edge, and Safari without polyfills or transpilation.
3. THE App SHALL produce no JavaScript errors in the browser console during normal operation including load, Transaction add, Transaction delete, sort, Category add, and Theme toggle actions.
4. IF a JavaScript error occurs in the browser console during any of the operations listed in criterion 3, THEN THE App SHALL remain in a consistent state with no data loss and display an error indication to the user.
