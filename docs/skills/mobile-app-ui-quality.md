# Mobile App UI Quality Skill

## Purpose

Use this skill whenever editing, refactoring, reviewing, or creating mobile app frontend UI.

The goal is to make the product feel like a polished, production-ready iOS/Android mobile app, not a desktop webpage squeezed into a phone screen.

This skill is especially important for:

- Home page
- Login / onboarding
- AI chat page
- Bottom tab navigation
- Cards
- Forms
- Lists
- Modals
- Timelines
- Pet care / pet AI assistant screens

## Core Design Standard

Follow both:

- Apple Human Interface Guidelines for iOS-like behavior, spacing, safe area, typography, and navigation.
- Material Design 3 / Android accessibility expectations for Android-like interaction, density, and touch behavior.

General principles:

- UI must be mobile-first.
- Every screen should have one clear primary purpose.
- Real-device usability is more important than decorative effects.
- The app should feel warm, friendly, practical, and production-ready.
- Do not make the UI look like a responsive desktop website.
- Do not create oversized cards.
- Do not make pages unnecessarily long.
- Avoid text-heavy home screens.
- Prefer concise labels, chips, status indicators, and simple actions.

## Non-negotiable Rules

These rules must not be violated:

1. The layout must work at 360px width.
2. Touch targets must be large enough:
   - iOS: at least 44 x 44 pt
   - Android: at least 48 x 48 dp
3. Safe areas must be respected on iOS and Android.
4. Bottom content must not be blocked by tab bars, home indicators, or gesture navigation.
5. The home screen must show the app's main value without long scrolling.
6. The bottom tab bar must have 4-5 tabs maximum.
7. Cards must be compact and focused.
8. The AI chat page must feel immersive and focused.
9. All UI changes must be implemented in actual code, not only described.
10. Existing design tokens and components should be reused before creating new ones.

## Design Tokens

Before changing UI, inspect whether the project already has design tokens.

If tokens exist, reuse and extend them instead of inventing new values.

If tokens do not exist, create or centralize them.

Recommended base tokens:

```ts
export const uiTokens = {
  spacing: {
    pageX: 16,
    sectionY: 16,
    cardPadding: 14,
    cardGap: 12,
    compactGap: 8,
    majorGap: 24,
  },
  radius: {
    small: 10,
    medium: 14,
    card: 18,
    large: 24,
    pill: 999,
  },
  colors: {
    background: '#FFF8EF',
    surface: '#FFFFFF',
    surfaceWarm: '#FFF3DF',
    primary: '#F59E0B',
    primarySoft: '#FFE2A8',
    secondary: '#84A59D',
    textPrimary: '#2D241F',
    textSecondary: '#7A6F66',
    textMuted: '#A99D92',
    border: 'rgba(80, 55, 30, 0.10)',
    danger: '#E85D5D',
    success: '#57A773',
    warning: '#F2B84B',
  },
  typography: {
    screenTitle: 26,
    sectionTitle: 17,
    cardTitle: 16,
    body: 14,
    caption: 12,
  },
  shadow: {
    card: '0 6px 18px rgba(70, 45, 20, 0.08)',
    floating: '0 10px 30px rgba(70, 45, 20, 0.14)',
  },
  animation: {
    fast: 180,
    normal: 240,
    slow: 320,
  },
}
```

Token rules:

- Avoid one-off spacing values unless necessary.
- Avoid too many font sizes.
- Avoid inconsistent radius values.
- Avoid random shadows on every component.
- Keep the visual rhythm consistent across screens.

## Layout Density

Use compact, app-like layouts.

Recommended values:

- Page horizontal padding: 16 px / dp
- Inner card padding: 12-16
- Vertical spacing between related elements: 8-12
- Vertical spacing between sections: 12-20
- Large spacing: 24 only for major page separation

Avoid:

- Huge 24-32 px gaps between every card
- Cards taller than necessary
- Long repeated descriptions inside cards
- Desktop-style two-column dense grids on small screens
- Large hero sections that push core actions below the fold

## Home Page Rules

The first screen should immediately communicate the main value of the app.

For a pet care / pet AI assistant app, prefer 4 main entry points maximum:

1. Feeding / meal plan
2. Quick record
3. Training / activity / pet knowledge
4. Check-in timeline

Home page requirements:

- Show pet status or today's key summary near the top.
- Show primary action clearly.
- Use short titles and one-line subtitles.
- Avoid long educational paragraphs.
- Use compact cards or horizontal action cards.
- Show important reminders without creating a notification wall.
- Keep emotional details small and delightful, not overwhelming.

Good home structure:

```txt
Header / pet identity
Today summary card
Primary action
4 quick entry points
Timeline / recent record preview
```

Avoid:

```txt
Huge marketing hero
Long explanation
Many feature cards
Large decorative image
Deep scrolling before core actions
```

## Typography

Use a clear hierarchy:

- Screen title: 22-28
- Section title: 16-18 semibold
- Card title: 15-17 semibold
- Body text: 13-15
- Caption / meta text: 11-13

Rules:

- Do not use too many font sizes.
- Do not use long paragraphs on the home page.
- Prefer short labels and meaningful states.
- Support scalable text / dynamic type where the framework allows it.
- Long text should wrap gracefully without breaking layout.
- Important numbers or states may use stronger weight, not excessive size.

## Visual Style

For this pet app, use:

- Warm background
- Soft orange / cream / light yellow accents
- Rounded cards
- Gentle shadows
- Clean icons
- Timeline or check-in progress visuals
- Small pet mascot moments where appropriate

The style should be:

- Warm
- Friendly
- Cute
- Clean
- Practical
- Not childish
- Not cluttered

Avoid:

- Excessive gradients
- Excessive floating decorations
- Too many emoji
- Heavy shadows
- Overly large illustrations
- Constant movement
- Decorative UI that reduces clarity

## Touch Target Rules

- iOS interactive controls should target at least 44 x 44 pt.
- Android interactive controls should target at least 48 x 48 dp.
- Leave enough spacing between tappable controls.
- Icons can look visually smaller, but their hit area must still meet the minimum target.
- Avoid tiny text-only links.
- Avoid placing destructive actions too close to primary actions.
- Important actions should be reachable with one hand where possible.

## Safe Area Rules

The UI must work on:

- iPhones with notch
- iPhones with Dynamic Island
- Android phones with gesture navigation
- Small Android screens
- Large phones

Requirements:

- Respect top safe area.
- Respect bottom safe area.
- Floating buttons must not overlap the home indicator.
- Chat input must not be blocked by keyboard or gesture navigation.
- Bottom tab bar must account for safe area.
- Avoid hardcoded absolute heights unless necessary.

## Component Rules

### Bottom Tab Bar

Requirements:

- Keep 4-5 tabs maximum.
- Labels must be short.
- Active state must be obvious.
- Must respect safe area.
- Should not be too tall.
- Use clear icons and labels.
- Keep badge count visually small.
- Hide only in immersive pages such as AI chat, camera, or full-screen flows.

Avoid:

- More than 5 tabs
- Long labels
- Weak active state
- Oversized tab bar
- Content hidden behind the tab bar

### Header / Navigation

Requirements:

- Header height should be compact.
- Use safe area.
- Avoid repeated large titles.
- If screen content already has a title, the header can be smaller.
- Back button must be visible and easy to tap.
- Important secondary actions should be accessible but not visually dominant.

AI chat detail page:

- Top app header may slide/fade up and disappear.
- It may transform into a compact chat header.
- Back button must remain visible.
- New Chat action must be available.
- Search History action must be available.

### Cards

Requirements:

- Each card should communicate one idea.
- Use short text.
- Use icons or visual cues to reduce reading burden.
- Prefer compact card grids or horizontal cards for frequent actions.
- Put the main value or state near the top.
- Keep actions limited and clear.

Avoid:

- Cards with too many buttons
- Cards with multiple unrelated purposes
- Large blank vertical space
- Long descriptions
- Repeated labels that do not add meaning

### Forms

Requirements:

- Inputs should be easy to tap.
- Labels must be clear.
- Required fields must be obvious.
- Error states must be visible.
- Error text should be close to the related field.
- Avoid long forms on one screen.
- Split complex input into steps when needed.
- Provide clear primary and secondary actions.
- Use keyboard-aware behavior on mobile.

Required states:

- Default
- Focus
- Filled
- Error
- Disabled
- Loading / submitting

### Lists

Requirements:

- Rows should be compact but tappable.
- Use clear title + short meta text.
- Use dividers or card grouping consistently.
- Empty states must be helpful.
- Long lists should support scroll performance.
- Avoid overly tall list items unless the visual content requires it.

### Modals / Sheets

Requirements:

- Prefer bottom sheets for mobile actions.
- Respect safe area.
- Keep content short.
- Primary action should be clear.
- Dismiss action should be obvious.
- Destructive actions require confirmation.

Avoid:

- Desktop-style centered modals that feel cramped on phones
- Tall modal content without scroll handling
- Hidden close buttons

### Buttons

Requirements:

- Primary action should be visually dominant.
- Secondary action should be clearly secondary.
- Disabled state must be visible.
- Loading state should prevent duplicate submission.
- Hit area must meet touch target rules.

Avoid:

- Multiple competing primary buttons on one screen
- Tiny icon-only buttons without accessible labels
- Buttons with unclear verbs

### Chips / Tags

Use chips for:

- Pet status
- Meal type
- Training category
- Check-in state
- Filter controls

Rules:

- Keep chip labels short.
- Active state must be clear.
- Chips must be tappable if interactive.
- Do not overload the screen with too many chips.

## AI Chat Page Rules

When entering AI chat:

- Bottom tab should slide/fade down and disappear.
- Top app header should slide/fade up and disappear or transform into a chat header.
- Chat input expands from compact to full-width.
- Main chat elements animate in with smooth scale/fade transition, like opening a box.
- Top-left back button must be visible.
- Provide New Chat action.
- Provide Search History action.
- Chat page should feel focused and immersive.

Chat layout requirements:

- Messages should have readable width.
- User and assistant messages should be visually distinct.
- Input should stay reachable above keyboard.
- Long messages should not break layout.
- Loading state should be visible.
- Empty state should suggest useful pet-related prompts.
- Error state should allow retry.
- History search should be accessible but not intrusive.

AI chat should avoid:

- Bottom tab remaining visible during focused chat
- Excessive decoration
- Oversized assistant cards
- Too many suggested prompts
- Input hidden behind keyboard
- Hardcoded viewport heights that break on mobile browsers

## State Design

Every important screen or component should handle these states:

### Loading

- Use skeletons or compact loading indicators.
- Avoid full-screen spinners unless necessary.
- Preserve layout stability.

### Empty

- Explain what is missing.
- Provide one clear action.
- Keep tone friendly and helpful.

Example:

```txt
No feeding record yet
Add today's first meal to start tracking your pet's routine.
[Add meal]
```

### Error

- Say what went wrong in plain language.
- Provide retry or recovery action.
- Do not expose raw technical errors to users.

### Offline

- Show cached content if possible.
- Make unavailable actions clear.
- Allow retry after reconnecting.

### Permission Denied

For camera, notification, location, or storage permission:

- Explain why permission is needed.
- Provide a clear next step.
- Do not trap the user.

### First-time User

- Keep onboarding short.
- Ask only for essential pet information first.
- Let the user skip non-critical steps.

### Returning User

- Show progress, reminders, and recent activity.
- Avoid repeating onboarding explanations.

## Accessibility Rules

Requirements:

- Text contrast should meet WCAG AA where possible.
- Do not rely on color alone to express state.
- Icons must have accessible labels.
- Important buttons must have clear text or accessibility labels.
- Support reduced motion where the framework allows it.
- Error messages should be tied to fields.
- Screen reader order should follow visual order.
- Focus states should be visible.
- Dynamic type / scalable text should not break layout.
- Touch targets must meet platform minimums.

Avoid:

- Icon-only controls without labels
- Low-contrast warm colors on light backgrounds
- Motion-only state changes
- Tiny captions used for important information

## Cross-platform Adaptation

Must work on:

- Android phones
- iPhones with notch / Dynamic Island
- Small screens
- Large phones

Test at common widths:

- 360 px
- 375 px
- 390 px
- 414 px
- 430 px

Rules:

- Use responsive layout utilities.
- Avoid content overflow.
- Avoid desktop-style dense grids.
- Avoid bottom content being blocked by gesture navigation or tab bar.
- Avoid fixed heights that break with dynamic content.
- Use platform-aware keyboard handling where available.
- Use safe-area padding or framework equivalent.

## Animation Rules

Use animation for:

- Entering AI chat
- Check-in flow
- Progress timeline
- Pet mascot breathing / blinking / tail wagging
- Button feedback
- Card expansion / collapse
- Small state transitions

Default animation:

- Duration: 180-320ms
- Easing: ease-out or subtle spring
- Prefer fade + translate + slight scale
- Keep motion subtle and functional

Avoid:

- Constant distracting movement
- Heavy animations that slow the app
- Large page transitions that feel like a demo
- Animations that block interaction
- Motion that ignores reduced-motion preferences

## Pet App Product Rules

The app should feel like a practical daily companion for pet owners.

Good patterns:

- "Today" summary
- Feeding reminders
- Quick record
- Pet profile
- Check-in streak
- Gentle health/activity hints
- AI assistant for pet questions
- Timeline of care actions
- Warm microcopy

Avoid:

- Over-medical tone unless the feature requires it
- Making AI advice look like veterinary diagnosis
- Too many gamified elements
- Overly childish graphics
- Emotional pressure or guilt-based copy

Medical / health UI caution:

- AI pet health suggestions should be framed as guidance, not diagnosis.
- For serious symptoms, recommend contacting a veterinarian.
- Emergency states should be visually clear and not hidden inside cute UI.

## Implementation Workflow

When modifying UI code:

1. Inspect existing layout, components, styles, and design tokens.
2. Identify the mobile UI problems before editing.
3. Reuse existing components and tokens where possible.
4. If tokens are missing, centralize spacing, colors, radius, shadows, and typography.
5. Refactor duplicated UI constants.
6. Make the screen compact and mobile-first.
7. Ensure safe area, keyboard, and bottom navigation behavior.
8. Check empty, loading, error, and disabled states.
9. Check 360px width.
10. Implement the changes in code.
11. Explain what changed and how to preview.

Do not:

- Only describe the design without editing code.
- Introduce inconsistent one-off styles.
- Replace the entire architecture unless necessary.
- Add decorative complexity that does not improve usability.
- Break existing behavior for the sake of visuals.

## Review Checklist Before Finishing

Before returning code, check:

1. Does the screen look like a real mobile app, not a web page?
2. Is the first screen visually clean?
3. Are there too many words?
4. Are cards too tall?
5. Is scrolling excessive?
6. Are touch targets large enough?
7. Are iOS/Android safe areas handled?
8. Is the bottom tab consistent?
9. Does the UI work at 360px width?
10. Are animations subtle and useful?
11. Is the design consistent with the pet app's warm / cute / practical positioning?
12. Are loading, empty, error, disabled, and offline states handled?
13. Are accessibility labels and contrast considered?
14. Are design tokens reused or centralized?
15. Are all changes implemented in actual code?

## Final Response Requirement

After modifying UI code, respond with:

```txt
Changed files:
- ...

Screens/components updated:
- ...

UI problems fixed:
- ...

Mobile checks:
- 360px:
- 375px:
- 390px:
- 414px:
- 430px:

States handled:
- Loading:
- Empty:
- Error:
- Disabled:
- Offline:

Accessibility notes:
- ...

Remaining improvements:
- ...

How to run and preview:
- ...
```

If some checks could not be run, say so honestly and explain what was reviewed manually.

## Default Behavior

Whenever a task involves mobile frontend UI, automatically apply this skill.

Examples:

- "优化首页"
- "改一下登录页"
- "这个页面不好看"
- "重构 AI chat"
- "帮我调整 tab bar"
- "让它更像 App"
- "移动端适配"
- "宠物 App UI 优化"
- "检查这个页面"
- "把这个页面做得更精致"

The assistant should not wait for the user to explicitly mention this skill. If the work affects mobile UI, apply it by default.
