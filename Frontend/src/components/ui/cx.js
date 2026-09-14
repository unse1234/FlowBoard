/** Join class names, skipping falsy parts. */
export function cx(...parts) {
  return parts.flat(Infinity).filter(Boolean).join(" ");
}

/**
 * One callback ref that writes to several refs.
 *
 * Primitives need their own ref (to position a tooltip or popover) while still
 * honouring a ref passed in by the caller.
 */
export function assignRefs(node, ...refs) {
  for (const ref of refs) {
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }
}

/**
 * Merge event handlers from a primitive's internal props with the caller's, so
 * neither side silently replaces the other.
 */
export function mergeHandlers(internal, external) {
  const merged = { ...external };

  for (const [name, handler] of Object.entries(internal)) {
    if (typeof handler !== "function") {
      if (merged[name] === undefined) merged[name] = handler;
      continue;
    }

    const theirs = external[name];
    merged[name] =
      typeof theirs === "function"
        ? (event) => {
            theirs(event);
            handler(event);
          }
        : handler;
  }

  return merged;
}
