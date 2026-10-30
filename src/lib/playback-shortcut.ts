// Keep native keyboard interaction on controls and editable content.
const CONTROL_SELECTOR = 'input, textarea, select, button, a[href], summary, [role="button"], [role="slider"], [role="combobox"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="checkbox"], [role="radio"], [role="switch"], [role="textbox"], [role="spinbutton"], [role="tab"]';

export function installPlaybackShortcut(
  document: Document,
  canToggle: () => boolean,
  toggle: () => void,
) {
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== ' ' || event.defaultPrevented || event.isComposing
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof Element && (
      target.closest(CONTROL_SELECTOR) || (target instanceof HTMLElement && target.isContentEditable)
    )) return;
    if (!canToggle()) return;
    event.preventDefault();
    if (!event.repeat) toggle();
  };
  document.addEventListener('keydown', keydown);
  return () => document.removeEventListener('keydown', keydown);
}
