/**
 * Shared helpers for deciding whether a touch drag should be allowed to scroll something.
 *
 * Both places that block background scrolling on mobile — MobileScrollBlockStrategy (dialogs and
 * the "Mere" sheet) and CollapsibleBottomBarComponent (the plan pages' bottom bar) — need the same
 * judgement: this element floats over the scrollable page, so a drag on it must not fall through,
 * *unless* it starts somewhere that can genuinely consume the scroll itself.
 *
 * Deliberately decided per touch in JS rather than declaratively in CSS. touch-action was tried
 * first and abandoned (see MobileScrollBlockStrategy's own comment): a drag starting on a
 * non-scrollable descendant, such as a form field, chained past its ancestors' touch-action: none
 * to the page behind. Reading the computed overflow and the actual scroll extent at the moment of
 * the touch isn't exposed to that ambiguity.
 */

/** A real scroll port with somewhere left to go — both halves matter. */
export function isScrollable(element: Element): boolean {
  const style = getComputedStyle(element);
  const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll';
  return scrolls && element.scrollHeight > element.clientHeight;
}

/**
 * Walks up from a touch's target looking for something that can absorb the scroll, stopping at
 * `boundary` (exclusive) so the search stays inside the floating surface. Returns null when the
 * touch began on inert chrome — a backdrop, a title bar, a row of buttons, a panel whose content
 * happens to fit — which is precisely the case the caller must block.
 *
 * Matching on computed style rather than on a known class matters: the scroll port is whatever
 * the layout actually produced, which is not always the element a stylesheet nominated.
 */
export function findScrollableAncestor(
  target: EventTarget | null,
  boundary: (element: Element) => boolean,
): Element | null {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.body) {
    if (boundary(element)) return null;
    if (isScrollable(element)) return element;
    element = element.parentElement;
  }
  return null;
}
