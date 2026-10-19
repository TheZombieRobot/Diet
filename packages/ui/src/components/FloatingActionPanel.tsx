import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { FloatingActionButton } from './FloatingActionButton';

export interface FloatingActionPanelProps {
  /** The accessible name of the "+" button. */
  label: string;
  /** The panel's content, shown above the button while it is open. */
  children: ReactNode;
}

/**
 * The floating "+" and the small panel it opens. The panel comes after the button in the page, so
 * the Tab key and a screen reader reach it next. It closes on Escape, on a tap outside the panel
 * and the button, and when the screen changes; Escape and an outside tap return focus to the "+".
 */
export function FloatingActionPanel({ label, children }: FloatingActionPanelProps): ReactElement {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(true);
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close(true);
    };
    const onRouteChange = (): void => {
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('hashchange', onRouteChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('hashchange', onRouteChange);
    };
  }, [open, close]);

  return (
    <>
      <FloatingActionButton
        ref={buttonRef}
        label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
      />
      {open ? (
        <div id={panelId} ref={panelRef} className="ui-fab-panel">
          {children}
        </div>
      ) : null}
    </>
  );
}
