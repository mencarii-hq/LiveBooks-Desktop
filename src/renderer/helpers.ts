import { Directive } from 'vue';

type OutsideClickCallback = (e: Event) => void;
const instanceMap: Map<HTMLElement, OutsideClickCallback> = new Map();

export const outsideClickDirective: Directive<
  HTMLElement,
  OutsideClickCallback
> = {
  beforeMount(el, binding) {
    const clickHandler = function (e: Event) {
      onDocumentClick(e, el, binding.value);
    };

    removeHandlerIfPresent(el);
    instanceMap.set(el, clickHandler);
    document.addEventListener('click', clickHandler);
  },
  unmounted(el) {
    removeHandlerIfPresent(el);
  },
};

function onDocumentClick(e: Event, el: HTMLElement, fn: OutsideClickCallback) {
  const target = e.target as Node;
  if (el === target || el.contains(target)) {
    return;
  }
  // Dropdown/Select lists Teleport to body (.popover-container). Treat those
  // clicks as inside the control or the first click never commits.
  if (
    target instanceof Element &&
    typeof target.closest === 'function' &&
    target.closest('.popover-container')
  ) {
    return;
  }
  fn?.(e);
}

function removeHandlerIfPresent(el: HTMLElement) {
  const clickHandler = instanceMap.get(el);
  if (!clickHandler) {
    return;
  }

  instanceMap.delete(el);
  document.removeEventListener('click', clickHandler);
}
