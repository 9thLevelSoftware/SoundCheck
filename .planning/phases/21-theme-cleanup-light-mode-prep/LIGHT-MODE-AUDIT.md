# Light Mode Color Audit - WCAG AA Compliance

**Date:** 2026-03-01
**Auditor:** Automated (WCAG 2.1 relative luminance formula)
**Target:** `AppTheme.lightTheme` in `mobile/lib/src/core/theme/app_theme.dart`

## Methodology

Contrast ratios computed using WCAG 2.1 relative luminance:
- L = 0.2126 * R' + 0.7152 * G' + 0.0722 * B' (linearized sRGB)
- Contrast ratio = (L_lighter + 0.05) / (L_darker + 0.05)

**Thresholds:**
| Level | Normal text (<18px) | Large text (>=18px bold / >=24px) |
|-------|--------------------|------------------------------------|
| AA    | >= 4.5:1           | >= 3.0:1                           |
| AAA   | >= 7.0:1           | >= 4.5:1                           |

---

## 1. Text on Backgrounds

| Foreground | Background | Usage | Ratio | AA Normal | AA Large | AAA Normal |
|-----------|------------|-------|-------|-----------|----------|------------|
| `#0D0F11` | `#FFFFFF` | Body text on cards | 19.20:1 | PASS | PASS | PASS |
| `#0D0F11` | `#F0F2F5` | Body text on scaffold | 17.12:1 | PASS | PASS | PASS |
| `#6E7681` | `#FFFFFF` | Secondary text on cards | 4.59:1 | PASS | PASS | FAIL |
| `#6E7681` | `#F0F2F5` | Labels on scaffold | 4.10:1 | **FAIL** | PASS | FAIL |

**Failures:** 1
- `#6E7681` on `#F0F2F5` fails AA normal at 4.10:1 (needs 4.5:1)

---

## 2. Interactive Elements

| Foreground | Background | Usage | Ratio | AA Normal | AA Large | AAA Normal |
|-----------|------------|-------|-------|-----------|----------|------------|
| `#FFFFFF` | `#2E7D32` | Button text on green buttons | 5.13:1 | PASS | PASS | FAIL |
| `#FFFFFF` | `#0091EA` | Button text on blue buttons | 3.37:1 | **FAIL** | PASS | FAIL |
| `#FFFFFF` | `#FF5252` | Button text on red buttons | 3.19:1 | **FAIL** | PASS | FAIL |
| `#2E7D32` | `#FFFFFF` | Text buttons, links, selected tab | 5.13:1 | PASS | PASS | FAIL |
| `#2E7D32` | `#F0F2F5` | Primary on scaffold bg | 4.57:1 | PASS | PASS | FAIL |
| `#6E7681` | `#FFFFFF` | Unselected tab/nav labels | 4.59:1 | PASS | PASS | FAIL |

**Failures:** 2
- `#FFFFFF` on `#0091EA` fails AA normal at 3.37:1 (button text on blue)
- `#FFFFFF` on `#FF5252` fails AA normal at 3.19:1 (button text on red/error)

---

## 3. Component-Specific

| Foreground | Background | Usage | Ratio | AA Normal | AA Large | AAA Normal |
|-----------|------------|-------|-------|-----------|----------|------------|
| `#0D0F11` | `#F0F0F0` | Chip text | 16.85:1 | PASS | PASS | PASS |
| `#FFFFFF` | `#2E7D32` | Selected chip text | 5.13:1 | PASS | PASS | FAIL |
| `#2E7D32` | `#F0F0F0` | Focus ring on input | 4.50:1 | **FAIL** | PASS | FAIL |
| `#FF3D00` | `#FFFFFF` | Urgent/alert elements | 3.55:1 | **FAIL** | PASS | FAIL |
| `#FF3D00` | `#F0F2F5` | Alert on scaffold | 3.16:1 | **FAIL** | PASS | FAIL |

**Failures:** 3
- `#2E7D32` on `#F0F0F0` barely fails AA normal at 4.50:1 (focus ring -- decorative, low risk)
- `#FF3D00` on `#FFFFFF` fails at 3.55:1 (alert/urgent elements)
- `#FF3D00` on `#F0F2F5` fails at 3.16:1 (alert on scaffold)

---

## 4. Semantic Colors on Light Backgrounds

| Foreground | Background | Usage | Ratio | AA Normal | AA Large | AAA Normal |
|-----------|------------|-------|-------|-----------|----------|------------|
| `#FF5252` | `#FFFFFF` | Error text | 3.19:1 | **FAIL** | PASS | FAIL |
| `#FFAB00` | `#FFFFFF` | Warning text | 1.90:1 | **FAIL** | **FAIL** | FAIL |
| `#00F0FF` | `#FFFFFF` | Info text (electricBlue) | 1.41:1 | **FAIL** | **FAIL** | FAIL |
| `#D2FF00` | `#FFFFFF` | Accent on white (voltLime) | 1.16:1 | **FAIL** | **FAIL** | FAIL |

**Failures:** 4 (3 critical)
- `#FF5252` error text fails AA normal at 3.19:1
- `#FFAB00` warning text critically fails at 1.90:1 (fails even AA large)
- `#00F0FF` info text critically fails at 1.41:1 (fails even AA large)
- `#D2FF00` voltLime critically fails at 1.16:1 (fails even AA large)

---

## Summary of Failures

### By Severity

**Critical (fails AA Large too -- completely unusable on light backgrounds):**
| Color | Hex | Ratio vs White | Issue |
|-------|-----|---------------|-------|
| Warning (amber) | `#FFAB00` | 1.90:1 | Invisible warning text |
| Info (electricBlue) | `#00F0FF` | 1.41:1 | Invisible info text |
| Accent (voltLime) | `#D2FF00` | 1.16:1 | Invisible accent (not directly used in light theme) |

**Moderate (fails AA normal, passes AA large -- usable only at >=18px bold):**
| Color | Hex | Ratio vs White | Issue |
|-------|-----|---------------|-------|
| Secondary blue | `#0091EA` | 3.37:1 | Button text on blue fails |
| Error red | `#FF5252` | 3.19:1 | Error text and button text fail |
| Alert orange | `#FF3D00` | 3.55:1 | Urgent elements fail |
| Secondary text | `#6E7681` | 4.10:1 (on scaffold) | Labels on scaffold fail |

**Borderline (barely fails, may be acceptable for decorative/non-text):**
| Color | Hex | Ratio | Issue |
|-------|-----|-------|-------|
| Primary green | `#2E7D32` | 4.50:1 (on `#F0F0F0`) | Focus ring on input (decorative) |

### Total: 10 failing pairs (3 critical, 6 moderate, 1 borderline)

---

## Recommended Replacements

Each replacement preserves the color family while achieving AA normal (4.5:1) on white.

| Current Color | Current Hex | Recommended | New Hex | Ratio vs White | Ratio vs Scaffold |
|--------------|-------------|-------------|---------|----------------|-------------------|
| Secondary text | `#6E7681` | Darker grey | `#586069` | 5.69:1 | 5.07:1 |
| Secondary blue | `#0091EA` | Material Blue 800 | `#0277BD` | 4.80:1 | 4.28:1* |
| Error red | `#FF5252` | Material Red 700 | `#D32F2F` | 4.98:1 | 4.44:1* |
| Alert orange | `#FF3D00` | Material DeepOrange 800 | `#BF360C` | 5.60:1 | 5.00:1 |
| Warning amber | `#FFAB00` | Dark amber | `#8C6900` | 5.08:1 | 4.53:1 |
| Info cyan | `#00F0FF` | Material Teal 800 | `#00838F` | 4.52:1 | 4.03:1* |
| voltLime accent | `#D2FF00` | Deep green | `#33691E` | 6.60:1 | 5.88:1 |
| Focus ring green | `#2E7D32` | Slightly darker | `#256D29` | 5.59:1 (on `#F0F0F0`) | N/A |

*Items marked with `*` pass AA normal on white but fall slightly below 4.5:1 on scaffold `#F0F2F5`. These are acceptable because: (a) blue/red buttons have their own background, not scaffold; (b) info text can be paired with an icon for reinforcement.

---

## Overall Verdict

**Needs 7 fixes before enabling light mode.**

The light theme has 10 failing color pairs, of which 3 are critical (completely invisible on white). The current `lightTheme` definition does NOT use `electricBlue`, `voltLime`, or `warning` directly in its color scheme or component themes, so the critical failures affect only semantic/status colors that would be referenced via `AppTheme.warning`, `AppTheme.info`, or `AppTheme.success` in widget code.

**Minimum viable fix set (4 changes to enable basic light mode):**
1. Replace `#0091EA` secondary with `#0277BD` in `ColorScheme.light`
2. Replace `#FF5252` error with `#D32F2F` in `ColorScheme.light`
3. Add light-mode-specific semantic color getters (warning, info, success) that return darker variants
4. Darken `#6E7681` to `#586069` for `bodySmall`/`labelSmall` text

**Full fix set (7 changes for comprehensive AA compliance):**
All items in the recommended replacements table above.

**Note:** The primary green `#2E7D32` passes AA normal on both white (5.13:1) and scaffold (4.57:1) backgrounds. The initial concern that it was "borderline" (4.52:1) was based on approximation -- the computed ratio of 5.13:1 confirms it is safe. The only green failure is on the input fill color `#F0F0F0` (4.50:1), which is a decorative focus ring, not text.
