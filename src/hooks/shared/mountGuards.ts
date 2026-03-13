"use client";
import { useRef, MutableRefObject } from 'react';

/**
 * Generic guard helpers to avoid repeated StrictMode double-invocation patterns.
 * Provides one-time init and mount semantics.
 */
export interface InitGuard {
  didInit: MutableRefObject<boolean>;
  initOnce: (fn: () => Promise<void> | void) => Promise<void> | void;
  resetInit: () => void;
}

export interface MountGuard {
  didMount: MutableRefObject<boolean>;
  mountOnce: (fn: () => void) => void;
  resetMount: () => void;
}

export function useInitGuard(): InitGuard {
  const didInit = useRef(false);
  function initOnce(fn: () => Promise<void> | void) {
    if (didInit.current) return;
    didInit.current = true;
    return fn();
  }
  function resetInit() { didInit.current = false; }
  return { didInit, initOnce, resetInit };
}

export function useMountGuard(): MountGuard {
  const didMount = useRef(false);
  function mountOnce(fn: () => void) {
    if (didMount.current) return;
    didMount.current = true;
    fn();
  }
  function resetMount() { didMount.current = false; }
  return { didMount, mountOnce, resetMount };
}

/** Convenience for components needing both init & mount guards together. */
export function useGuardPair() {
  return { ...useInitGuard(), ...useMountGuard() };
}
