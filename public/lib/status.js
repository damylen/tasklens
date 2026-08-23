/** Ideas and completed work remain visible, but never raise operational alerts. */
export function isOperationalStatus(status) {
  return status !== "done" && status !== "wishlist";
}
