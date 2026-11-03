---
name: Ma Cave Design Language
colors:
  surface: '#fff9ed'
  surface-dim: '#e0dac9'
  surface-bright: '#fff9ed'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf3e2'
  surface-container: '#f5eddc'
  surface-container-high: '#efe8d7'
  surface-container-highest: '#e9e2d1'
  on-surface: '#1e1c11'
  on-surface-variant: '#454842'
  inverse-surface: '#333025'
  inverse-on-surface: '#f7f0df'
  outline: '#767872'
  outline-variant: '#c6c7c0'
  surface-tint: '#5c5f59'
  primary: '#292c26'
  on-primary: '#ffffff'
  primary-container: '#3f423c'
  on-primary-container: '#acaea6'
  inverse-primary: '#c5c7bf'
  secondary: '#4f6359'
  on-secondary: '#ffffff'
  secondary-container: '#d1e8db'
  on-secondary-container: '#55695f'
  tertiary: '#272d27'
  on-tertiary: '#ffffff'
  tertiary-container: '#3d433d'
  on-tertiary-container: '#a9afa8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e3db'
  primary-fixed-dim: '#c5c7bf'
  on-primary-fixed: '#191c17'
  on-primary-fixed-variant: '#454842'
  secondary-fixed: '#d1e8db'
  secondary-fixed-dim: '#b6ccc0'
  on-secondary-fixed: '#0c1f18'
  on-secondary-fixed-variant: '#374b42'
  tertiary-fixed: '#dee4dc'
  tertiary-fixed-dim: '#c2c8c0'
  on-tertiary-fixed: '#171d18'
  on-tertiary-fixed-variant: '#424842'
  background: '#fff9ed'
  on-background: '#1e1c11'
  surface-variant: '#e9e2d1'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 3.25rem
    fontWeight: '600'
    lineHeight: 3.75rem
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.625rem
    fontWeight: '600'
    lineHeight: 2.125rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.875rem
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.625rem
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.0625rem
    fontWeight: '400'
    lineHeight: 1.625rem
    letterSpacing: '0'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: '0'
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0.005em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.04em
  caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 2rem
  margin: 1.25rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies the ethos of Nordic architectural minimalism applied to cellar curation and oenology. Rooted in restraint, natural materials, and quiet luxury, the aesthetic moves away from tech-heavy utility toward an editorial, organic sanctuary.

The visual direction references mid-century Scandinavian furniture, limestone surfaces, tactile linen, and muted botanical preservation. It evokes tranquility, enduring craftsmanship, and unhurried discernment. The interface breathes with generous structural white space, soft earth pigments, and fine typographic rhythm, creating a serene sanctuary for cataloging, aging, and appreciating wine.

## Colors

The palette is derived directly from classic architectural RAL standards, calibrated for digital balance and tactile warmth:

- **Primary (`#3F423C` / RAL 7022 Gris terre d'ombre):** Deep, warm mineral charcoal. Anchors high-contrast interactions, primary CTAs, active iconography, and primary editorial titles. Never harsh like pure black; grounded like slate and dark earth.
- **Secondary (`#BDD3C7` / RAL 6019 Vert pastel):** Muted botanical lichen. Applied selectively for maturity indicators, organic tags, ready-to-drink status badges, subtle hover highlights, and celebratory micro-accents.
- **Tertiary (`#BAC0B8` / RAL 7038 Gris agate):** Calibrated stone grey. Serves as structural scaffolding: card hair-lines, dividers, inactive states, table frames, and muted neutral badges.
- **Neutral (`#EAE3D2` / RAL 1015 Ivoire clair):** Warm, porous limestone background. Replaces raw white across root surfaces, creating a luminous, eye-resting foundation that honors printed wine labels and cellaring notebooks.

Surface hierarchy:
- `surface-canvas`: `#EAE3D2` (Primary root canvas)
- `surface-card`: `#F3EFE6` (Lightened ivory for elevated modules and bottle sheets)
- `surface-elevated`: `#FAF7F2` (Highest contrast container for active sheets and dialogs)
- `text-primary`: `#3F423C`
- `text-muted`: `#696C64` (Desaturated umbra for vintages, regions, and metadata)
- `border-subtle`: `#D6D3C8` (Warm-tinted division)
- `border-strong`: `#BAC0B8` (Structural structural line work)

## Typography

The type system relies entirely on Plus Jakarta Sans, using its humanist proportions and clean geometry to create a modern architectural voice. 

- **Weight Discipline:** Restrict weights primarily to `400` (Regular), `500` (Medium), and `600` (SemiBold). Avoid ultra-heavy weights to maintain an airy, understated cadence.
- **Numbers & Vintages:** Numeric values (vintages, shelf numbers, bottle counts, ABV) must utilize lining figures with neutral letter-spacing for balanced tabulation.
- **Micro-labels & Status:** Labels such as appellations and aging states utilize `label-sm` or `caption` with slight uppercase tracking (`0.04em` to `0.06em`) to evoke museum archive index cards.

## Layout & Spacing

The layout is grounded in a fluid architectural grid system structured on an 8-point base module:

- **Desktop (1024px+):** 12-column layout with 32px (`2rem`) gutters and 48px (`3rem`) outer padding. Maximum content constraint capped at 1280px to preserve intimate composition.
- **Tablet (768px – 1023px):** 8-column layout with 24px (`1.5rem`) gutters and 32px (`2rem`) margins.
- **Mobile (under 768px):** 4-column layout with 20px (`1.25rem`) gutters and 20px (`1.25rem`) margins.

Rhythm guidelines:
- Cellar and shelf overviews prioritize open horizontal bands with wide spacing (`space-xl`) between distinct wine regions or storage compartments.
- Dense data points (grape composition, drinking windows, tasting notes) use tight vertical pairs (`space-xs` between label and value) wrapped in generous perimeter padding (`space-lg`).

## Elevation & Depth

This design system consciously rejects heavy drop shadows in favor of Scandinavian architectural planar depth:

1. **Tonal Planar Stacking:** Surfaces step up in luminosity. The base viewport rests on `#EAE3D2`, card modules lift up to `#F3EFE6`, and floating sheets or modals rest on `#FAF7F2`.
2. **Hairline Outlines:** Containers are outlined with a fine 1px border in `#BAC0B8` or `#D6D3C8`, delivering crisp boundary definition reminiscent of drafted architectural drawings.
3. **Soft Ambient Occlusion:** Where physical separation is required (dropdowns, drawers, floating bottle scanners), rely exclusively on ultra-soft, low-opacity, tinted diffusion:
   - `box-shadow: 0 8px 30px -4px rgba(63, 66, 60, 0.07)`
   - No directional harsh lighting; light is treated as diffuse daylight through frosted glass.

## Shapes

The interface adopts a calibrated architectural softness (`roundedness: 1`):

- **Micro elements & inputs:** 4px (`0.25rem`) corner radius.
- **Cards, bottle viewports, and cellaring panels:** 8px (`0.5rem`) corner radius.
- **Drawers, sheets, and hero banners:** 12px (`0.75rem`) corner radius.
- **Pill exceptions:** Exclusively reserved for status chips and filter tags requiring quick visual scanning.

The restraint in curvature preserves geometric structure and evokes cut stone, joinery, and natural shelving.

## Components

### Buttons
- **Primary:** Surface `#3F423C` with text `#FAF7F2`. Sharp 4px radius, padded with `0.75rem 1.5rem`. Hover shifts to `#4B4D46` with smooth 150ms ease. Active state scales subtly (`scale: 0.99`).
- **Secondary:** Surface `#FAF7F2` with 1px border `#BAC0B8` and text `#3F423C`. Hover adopts a soft tint of `#BDD3C7` at 20% opacity.
- **Ghost / Tertiary:** Borderless, text `#3F423C`, active state indicated by an underline in `#BAC0B8`.

### Chips & Badges
- **Peak Maturity (Drink Now):** Background `#BDD3C7` (RAL 6019) with text `#28322B`. Text weight `600`, pill radius (999px), micro-padding `0.25rem 0.625rem`.
- **Aging / Keeping:** Background `#BAC0B8` at 30% opacity with text `#3F423C`.
- **Classification / Appellation:** Minimal outline chip, 1px border `#BAC0B8`, background `#F3EFE6`.

### Cards & Cellar Shelves
- Container: Surface `#F3EFE6`, 1px border `#D6D3C8`, radius `0.5rem`.
- Padding: `1.25rem` internal clearance.
- Content Layout: Split architecture with bottle silhouette/label frame on a stone inset background (`#EAE3D2`), followed by vintage title, domaine name, and aging readiness pill.

### Input Fields & Selectors
- Background `#FAF7F2`, 1px border `#BAC0B8`, text `#3F423C`, radius `4px`.
- Focus ring: 1px border replaced by `#3F423C` with an outer 2px halo in `#BDD3C7` (50% opacity). Never stark blue.
- Labels sit above the field in `label-sm` with color `#696C64`.

### Checkboxes & Radios
- Square with 3px radius for checkboxes; pure circle for radios.
- Unchecked: `#FAF7F2` fill with 1.5px border `#BAC0B8`.
- Checked: Fill `#3F423C` with icon/indicator in `#FAF7F2`.

### Specialized Domain Components: Bottle Racks & Inventory Sliders
- **Rack Grid Slot:** Subtle square frame bordered in `#D6D3C8`. Occupied slots feature an umbra bottle-cap silhouette (`#3F423C`) with vintage imprint; empty slots show a subtle dashed aperture.
- **Tasting Window Timeline:** Horizontal segmented rule using `#BAC0B8` for historical years, `#BDD3C7` for peak maturity window, and `#3F423C` for the current year cursor.