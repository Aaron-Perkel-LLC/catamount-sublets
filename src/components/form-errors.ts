/**
 * After a refused save, client-side or from the server: bring the first field
 * marked aria-invalid into the middle of the screen, with its label above and
 * its message below, and put the cursor in it. With no field to blame, the
 * form's alert is brought into view instead.
 */
export function focusFirstInvalid(root: HTMLElement | null): void {
  if (!root) return;
  const field = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  const target = field ?? root.querySelector<HTMLElement>('[role="alert"]');
  if (!target) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  (target.closest("label, fieldset") ?? target).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  if (field) field.focus({ preventScroll: true });
}
