import { useMemo } from 'react';
import { PanResponder } from 'react-native';

type Params = {
  isExpanded: boolean;
  onDismiss: () => void;
  onExpandStateChange?: (expanded: boolean) => void;
};

// The calendar day sheet has three states: closed, compact, and expanded.
// This hook owns only the drag thresholds so the sheet UI stays focused on rendering.
export function useCalendarDaySheetDrag({ isExpanded, onDismiss, onExpandStateChange }: Params) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -34 || gesture.vy < -0.7) {
        onExpandStateChange?.(true);
        return;
      }

      if (gesture.dy > 34 || gesture.vy > 0.7) {
        if (isExpanded) onExpandStateChange?.(false);
        else onDismiss();
      }
    },
  }).panHandlers, [isExpanded, onDismiss, onExpandStateChange]);
}
