---
name: Autenticar Modern Marketplace
colors:
  surface: '#f8f9ff'
  surface-dim: '#c4dcfd'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4ff'
  surface-container: '#e4efff'
  surface-container-high: '#dbe9ff'
  surface-container-highest: '#d1e4ff'
  on-surface: '#011d35'
  on-surface-variant: '#41484b'
  inverse-surface: '#19324b'
  inverse-on-surface: '#e9f1ff'
  outline: '#71787c'
  outline-variant: '#c1c7cb'
  surface-tint: '#3e6373'
  primary: '#002835'
  on-primary: '#ffffff'
  primary-container: '#153e4d'
  on-primary-container: '#83a9bb'
  inverse-primary: '#a5ccdf'
  secondary: '#7b5900'
  on-secondary: '#ffffff'
  secondary-container: '#fdbf35'
  on-secondary-container: '#6e4f00'
  tertiary: '#371f00'
  on-tertiary: '#ffffff'
  tertiary-container: '#503410'
  on-tertiary-container: '#c59c6f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c1e8fb'
  primary-fixed-dim: '#a5ccdf'
  on-primary-fixed: '#001f29'
  on-primary-fixed-variant: '#254b5b'
  secondary-fixed: '#ffdea4'
  secondary-fixed-dim: '#fabd32'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4200'
  tertiary-fixed: '#ffddba'
  tertiary-fixed-dim: '#eabf8f'
  on-tertiary-fixed: '#2b1700'
  on-tertiary-fixed-variant: '#5f411c'
  background: '#f8f9ff'
  on-background: '#011d35'
  surface-variant: '#d1e4ff'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-desktop: 48px
  margin-mobile: 16px
  unit-xs: 4px
  unit-sm: 8px
  unit-md: 16px
  unit-lg: 24px
  unit-xl: 40px
---

## Brand & Style

The design system is engineered for a high-trust automotive marketplace, prioritizing clarity, efficiency, and professional reliability. The brand personality is authoritative yet accessible, designed to guide users through high-value transactions with ease.

The visual style is **Corporate / Modern**. It leverages a structured grid and a sophisticated dark palette to evoke a premium showroom feel. By focusing on a clean, light-filled interface with deep teal accents, the design system ensures that high-quality vehicle imagery remains the primary focus. The emotional response is one of security and transparency, critical for an industry built on technical specifications and financial commitment.

## Colors

The color strategy centers on the deep teal primary color to establish a sense of depth and stability. 

- **Primary (#153E4D):** Used for navigation bars, primary buttons, and critical branding elements. It provides the "High-Trust" foundation.
- **Secondary (#F0B429):** An accent gold/yellow (derived from the logo's spark/key element) used sparingly for high-priority call-to-actions, price highlights, or "Certified" badges to ensure they pop against the deep teal.
- **Neutral Tier:** A range of cool greys and off-whites are used for layout borders and background contrast. Text should primarily use a dark navy-grey to maintain better readability than pure black.
- **Functional Colors:** Standard success (green), error (red), and warning (orange) tones are desaturated slightly to align with the professional corporate aesthetic.

## Typography

This design system utilizes **Manrope** for its modern, geometric construction and excellent legibility in data-heavy environments. It conveys a technical yet friendly tone.

- **Headlines:** Use Bold and Extra Bold weights to create a clear hierarchy. Large price points should use `headline-lg` to command attention.
- **Body Text:** Use Medium and Regular weights. Paragraphs are set with generous line heights to improve scannability of technical descriptions.
- **Labels:** **Hanken Grotesk** is used for UI labels, technical specifications (e.g., "Engine Displacement", "Fuel Type"), and navigation links. Its slightly more condensed nature allows for efficient use of space in filters and sidebars.

## Layout & Spacing

The design system employs a **Fixed Grid** approach for desktop to maintain a premium, controlled editorial feel, transitioning to a fluid layout for mobile devices.

- **Desktop (1280px+):** A 12-column grid with 24px gutters. Search filters typically occupy a 3-column sidebar on the left, with search results spanning the remaining 9 columns.
- **Tablet:** An 8-column grid. Sidebars collapse into a horizontal "Filter" bar or a drawer.
- **Mobile:** A 4-column grid with 16px margins. Content is strictly stacked, with vehicle cards occupying the full width.
- **Spacing Rhythm:** All spacing follows an 8px base unit. Small adjustments (4px) are reserved for tight component internal padding, such as icon-to-text relationships.

## Elevation & Depth

To maintain a high-trust, professional aesthetic, this design system uses **Tonal Layers** combined with **Ambient Shadows**.

- **Surface Levels:** The main page background is a very light grey or white. Content "blocks" (vehicle cards, filter sections) sit on pure white surfaces.
- **Shadows:** Use extremely soft, low-opacity shadows (e.g., `box-shadow: 0 4px 20px rgba(16, 42, 67, 0.08)`). This provides a subtle lift without appearing dated or heavy.
- **Dividers:** Use thin, 1px borders in a light cool-grey for separating technical specifications. Avoid using shadows for internal row separation; rely on clean lines to maintain the "organized" feel.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a contemporary feel that is more approachable than sharp corners but more professional than overly rounded "bubbly" interfaces.

- **Small Components:** Checkboxes, input fields, and small tags use 4px (0.25rem) corners.
- **Cards & Modals:** Vehicle detail cards use 8px (0.5rem) to suggest a self-contained container.
- **Images:** Vehicle thumbnails should always match the container's roundedness to maintain a cohesive silhouette.

## Components

### Buttons
- **Primary:** Solid `#153E4D` with white text. Used for "Contact Seller" or "View Details".
- **Secondary:** Outline `#153E4D` or the accent `#F0B429`. Used for "Save Search" or "Compare".
- **Ghost:** No border, teal text. Used for secondary navigation or "Clear All Filters".

### Vehicle Cards
The cornerstone component. It must include:
- Large aspect-ratio image (4:3).
- Price in `headline-md` using Primary color.
- Key specs (Year, Mileage, Fuel) as a horizontal row of icon+label combinations using `label-sm`.
- A subtle hover state that slightly deepens the ambient shadow.

### Input Fields & Filters
- **Search Inputs:** Large, clear fields with a 1px border. On focus, the border transitions to Primary teal.
- **Multi-select Chips:** Used for active filters. Background should be a light tint of the primary color with a "close" icon.
- **Checkboxes:** Square with soft corners. The checkmark should be white on a Primary teal background when active.

### Data Tables (Specifications)
- Alternating row stripes (Zebra striping) using a 2% opacity teal to help the eye track across technical specs like "Cylinders" or "Transmission Type".
- Bold labels on the left, regular weight values on the right.