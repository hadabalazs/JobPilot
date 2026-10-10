/** Apply a normal or Shift-click checkbox selection while preserving hidden selections. */
export function applyRangeSelection(visibleIds, currentIds, anchorId, targetId, checked, shiftKey) {
  const selected = new Set(currentIds || []);
  const targetIndex = visibleIds.indexOf(targetId);
  const anchorIndex = visibleIds.indexOf(anchorId);
  const ids = shiftKey && targetIndex >= 0 && anchorIndex >= 0
    ? visibleIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
    : [targetId];
  for (const id of ids) checked ? selected.add(id) : selected.delete(id);
  return { selected: [...selected], anchorId: targetId };
}
