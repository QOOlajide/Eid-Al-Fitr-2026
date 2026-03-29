Frontend Best Practices
Tech stack: React 18 (CRA), React Router v6, Tailwind CSS (via CRACO), CSS variables, Framer Motion, Lucide, Socket.IO, Stripe.

Goal: Ship fast, accessible UI without overengineering (premature abstractions, complex patterns) or underengineering (spaghetti components, copy‑paste styling). Cursor should propose changes that keep this balance.

Architecture
Use feature‑based folders (/pages, /components, /features/<domain>).

One route = one page component, keep pages mostly for layout + data wiring.

Extract a component only when:

Repeated ≥ 3 times, or

It has clear, reusable behavior (e.g. PageSection, PrimaryButton, Card).

Prefer composition over inheritance/HOCs.

React & State
Use local state for UI concerns (open/closed, selected tab, filters).

Use React Query / simple hooks only if data is async and shared across >1 page; otherwise keep it local.

Avoid global state libraries unless:

A piece of state is used in 3+ distant parts of the tree, and

Lifting state up makes components clearly worse.

Keep components small:

< 200 lines ideally

If JSX is deeply nested, extract “leaf” pieces into child components.

Routing
Use React Router v6:

Routes + Route in a central AppRoutes component.

Keep URL paths semantic: /schedule, /prayer-guide, /zakat.

Use index routes for default sub‑views instead of if branches where possible.

Styling: Tailwind + CSS Variables
Use CSS variables for theme tokens:

Colors, radii, spacing, shadows.

Light/dark themes via [data-theme] on <html>.

Use Tailwind for layout and spacing:

flex, grid, gap, p-*/m-*, max-w-*, text-*, bg-*.

Use component classes (e.g. .feature-card) only when:

The pattern is reused, or

Tailwind class strings become unreadable.

Don’t prematurely create design‑system components; start with:

Button, Card, PageSection, Input, Badge.

Animations (Framer Motion)
Use Framer Motion for:

Page transitions (AnimatePresence + motion.main).

List item entrances (schedule items, prayer steps, QA results).

Subtle hover/lift on cards and buttons.

Avoid:

Long durations (> 400ms) for core navigation.

Animating layout in ways that cause jank on mobile.

Keep animation configs centralised:

Reuse simple variants for pages and list items.

Accessibility
Always have:

main, header, footer, nav landmarks.

A skip to content link.

Use semantic HTML; only add ARIA when necessary.

Ensure:

Keyboard focus is always visible.

Color contrast is sufficient in both light and dark themes.

Inputs and interactive elements must have:

Labels,

aria-* only if semantics aren’t obvious.

Performance
Keep bundle simple:

Avoid heavy UI libs; you already have Tailwind + custom components.

Use code-splitting only for clearly heavy pages (e.g. Forum, Islamic Q&A) if needed.

Memoize (React.memo, useMemo, useCallback) only when:

There’s a measurable re-render issue, not “just in case”.

Working With Cursor
Treat Cursor as a pair programmer, not an architect:

Ask for concrete diffs (e.g. “refactor SchedulePage to use Tailwind spacing, no new abstractions”).

When Cursor suggests extra layers (context, new hooks, abstractions), check:

Is there real duplication or complexity right now?

Is this used in ≥ 2–3 places?

Guardrails:

No new global state or new libraries without an explicit reason.

No “design system” folder until you have repeated patterns.

Prefer small, incremental refactors over big rewrites.

When In Doubt
Bias toward:

Straightforward code that a junior dev could understand.

Incremental improvements (one component/section at a time).

If a change makes it harder to:

Read,

Test,

Or adjust styles/behavior,
it’s probably overengineered.