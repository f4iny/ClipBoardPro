# Comprehensive Tests, Code Review, and Repository Polish Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full test coverage for ClipBoardPro core modules, execute a strict code review eliminating all 50 ESLint warnings, and bring documentation (README, BUGS registry) to gold standard quality ready for merging to main.

**Architecture:** Setup Vitest + Happy-DOM seamlessly inside Vite configuration without bloat. Write comprehensive unit & integration tests covering ADR-0001 (memory trim debounce), ADR-0002 (media storage lifecycle & reconciliation), ADR-0003 (clipboard debouncing), theme management, i18n key consistency, and UI filtering/search algorithms. Clean up all ESLint warnings and update README with accurate build, test, and architecture documentation.

**Tech Stack:** Vitest, Happy-DOM, Electron, React 18, Vite, ESLint 9, SCSS.

**Spec:** User request: "Покрой тестами нужные части проекта или весь проект на твое усмотрение, нужно сделать код ревью и привести в идеал перед пушем в основную ветку. readme файл тоже касается"

## Global Constraints
- Zero OS Reboots (GEMINI.md rule 1).
- Safe Asar & file structure preservation (GEMINI.md rule 2).
- Zero warnings on `npm run lint` (`eslint .`).
- Clean build on `npm run build`.
- All tests must pass cleanly on `npm test`.

## Review Focus
1. Unhandled errors or swallowed exceptions in catch blocks in `main.js` and `App.jsx`.
2. React hook dependency warnings in `App.jsx` (`useEffect` missing `clearHistory`).
3. Translation key mismatch across languages causing UI blank text.
4. Edge cases in `ClipboardDebouncer` (rapid spamming, cancel, flush).
5. Theme import/export schema validation preventing crashes on corrupted JSON.

---

### Task 1: Setup Vitest Testing Infrastructure

**Files:**
- Modify: `vite.config.js`
- Modify: `package.json`

- [ ] **Step 1: Configure Vitest in `vite.config.js`**
  Add `test` property to `defineConfig` with `happy-dom` environment, globals enabled, and test pattern `test/**/*.test.{js,mjs,jsx}`.

- [ ] **Step 2: Add test scripts to `package.json`**
  Add `"test": "vitest run"` and `"test:watch": "vitest"` to `"scripts"`.

- [ ] **Step 3: Verify runner with a smoke test**
  Create `test/smoke.test.js` asserting true is true, run `pnpm test`, confirm pass, then remove smoke test.

---

### Task 2: Unit Tests for Electron Core Logic (ADR-0001, ADR-0002, ADR-0003)

**Files:**
- Create: `test/electron/clipboard_debouncer.test.js`
- Create: `test/electron/media_storage.test.js`
- Create: `test/electron/memory_trim.test.js`

- [ ] **Step 1: Write `test/electron/clipboard_debouncer.test.js`**
  Test 50ms debouncing, rapid multi-event coalescing, `isPending`, `cancel()`, and `flush()`.
- [ ] **Step 2: Write `test/electron/media_storage.test.js`**
  Test media directory creation, ID generation, file persistence, deletion, and reconciliation logic.
- [ ] **Step 3: Write `test/electron/memory_trim.test.js`**
  Test 2000ms debounce timer for memory trim, cancellation on window restore, and timer resets.
- [ ] **Step 4: Run test suite to verify all pass**
  Run: `pnpm test`
  Expected: All Electron core tests pass.

---

### Task 3: Unit Tests for Frontend Core Utilities (Theming & i18n)

**Files:**
- Create: `test/utils/themeManager.test.js`
- Create: `test/utils/i18n.test.js`

- [ ] **Step 1: Write `test/utils/themeManager.test.js`**
  Test default theme listing (`dark`, `light`), custom theme saving to `localStorage`, CSS variable application to `document.documentElement`, theme deletion with fallback, and import/export format validation.
- [ ] **Step 2: Write `test/utils/i18n.test.js`**
  Test `i18n.init()`, language switching, translation key completeness across all supported languages (ensure no missing keys relative to English reference dictionary).
- [ ] **Step 3: Run test suite to verify all pass**
  Run: `pnpm test`
  Expected: All utility tests pass.

---

### Task 4: UI Logic & Algorithm Tests (Filtering, Search, Auto-Delete)

**Files:**
- Create: `test/components/filtering_and_state.test.js`

- [ ] **Step 1: Write `test/components/filtering_and_state.test.js`**
  Test BUG-004 regression: dynamic category counts calculation (`all`, `text`, `image`, `code`).
  Test search query matching across items with case-insensitivity.
  Test auto-delete expiration policy logic (filtering items older than retention threshold).
- [ ] **Step 2: Run test suite to verify all pass**
  Run: `pnpm test`
  Expected: All tests pass.

---

### Task 5: Code Review & ESLint Zero-Warning Cleanup

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Header.jsx`
- Modify: `src/components/ClipboardHistory.jsx`
- Modify: `src/components/ClipboardItem.jsx`
- Modify: `src/components/EditModal.jsx`
- Modify: `src/components/Footer.jsx`
- Modify: `src/components/SettingsModal.jsx`
- Modify: `src/components/ThemeBuilder.jsx`
- Modify: `src/components/TitleBar.jsx`
- Modify: `src/utils/i18n/LanguageProvider.jsx`
- Modify: `src/utils/i18n/i18n.js`
- Modify: `src/electron/main.js`

- [ ] **Step 1: Clean up unused imports & variables in React components**
  Fix React 17+ unused `React` imports, remove unused variables (`isSearchFocused`, `t`, `customThemes`), and resolve `useEffect` dependency in `App.jsx`.
- [ ] **Step 2: Clean up unused parameters & catch variables in `SettingsModal.jsx` & `LanguageProvider.jsx`**
  Fix parameter declarations and export pattern warnings.
- [ ] **Step 3: Clean up unused catch parameters and dead code in `src/electron/main.js`**
  Use modern ES catch syntax `catch {}` where error object is deliberately ignored, clean up unused vars.
- [ ] **Step 4: Run `npm run lint` and verify 0 errors, 0 warnings**
  Run: `npm run lint`
  Expected: 0 problems (0 errors, 0 warnings).
- [ ] **Step 5: Run `npm run build` and `npm test`**
  Verify full clean build and tests green.

---

### Task 6: Modernize & Polish README.md and Documentation

**Files:**
- Modify: `README.md`
- Modify: `BUGS.md`

- [ ] **Step 1: Polish `README.md`**
  Correct outdated tech stack details, add testing instructions (`npm test`), document architecture ADRs (`docs/adr/`), fix build output directory (`release/`), and ensure clear, professional presentation.
- [ ] **Step 2: Update `BUGS.md`**
  Update verified tests columns in `BUGS.md` with links to the permanent automated test files created in `test/`.
- [ ] **Step 3: Final verification**
  Run all verification commands: `npm run lint`, `npm test`, `npm run build`.
