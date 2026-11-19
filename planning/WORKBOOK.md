# Using the sprint workbook

The workbook has four sheets: Sprint, Costs, Editorial and Decisions. Amber cells are editable. Working titles, assignments, estimates and founder decisions are proposals.

## Updating the plan

- In Sprint, update status, low/high estimated hours and actual hours. Totals and variance recalculate. A blank actual-hours cell means no time has been logged. An explicit zero is treated as zero.
- In Costs, edit quantities and unit monthly rates. Fixed vendor high rates follow the low rate; allowances have separate low/high inputs. Monthly equivalent is distinct from billing cadence. Annual upfront includes prepaid annual subscriptions, not the later monthly invoices.
- In Editorial, assign owners and update progress as each proposed article is commissioned. The six weeks are relative to launch because no launch date has been selected.
- In Decisions, assign the actual owner and record Discussing, Decided or Deferred as appropriate. None starts as Decided.

The workbook mirrors the supplied 16-ticket backlog and six-week editorial calendar. Changes made in Excel do not automatically write back to the JSON or CSV planning files. Choose one working record during execution and reconcile deliberate changes before regenerating.

## Regeneration

`build_workbook.mjs` generates the workbook through the ChatGPT Spreadsheets skill and the managed `@oai/artifact-tool` runtime. It is an authoring utility, not application backend code. Use the managed runtime and its documented temporary-directory dependency setup.

The script takes two arguments: the development-kit directory and the output directory. It reads `planning/BACKLOG.json` and `editorial/SIX_WEEK_CALENDAR.json`, writes one workbook, creates visual previews and a verification record, and writes the workbook decision data to `planning/WORKBOOK_DECISIONS.json`.

Regeneration replaces the output workbook. Preserve any live edits before regenerating. The initial builder includes checks for the original planning totals; update those expectations only when the founders deliberately approve changes to the plan.

## Verification completed

All four sheets were rendered and inspected. Formula results and representative input changes were checked, including a social-channel quantity change, completed-task count, actual-hours updates, and zero versus blank actual hours. Temporary changes were restored. Exported XML preserves the formulas, status lists and frozen panes and contains no cached formula errors. The workbook was not executed in a native Microsoft Excel application.
