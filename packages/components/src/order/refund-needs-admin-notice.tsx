import type { JSX } from 'react';
import { View } from 'react-native';
import { NEEDS_ADMIN_MESSAGE_MAX } from '@tallyui/core';
import { refundNeedsAdminLine } from '@tallyui/pos';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

export type RefundNeedsAdminNoticeProps = {
  /** The server's needs_admin reason: the outcome's `reason`, or a pending record's `error.data.reason`. */
  reason: string;
  /** The server's message: shown under the lead line as plain text, cut to NEEDS_ADMIN_MESSAGE_MAX. */
  message?: string;
  /** Resends the same refund envelope (same id); omit to hide the button. */
  onCheckAgain?: () => void;
};

export function RefundNeedsAdminNotice({ reason, message, onCheckAgain }: RefundNeedsAdminNoticeProps): JSX.Element {
  return <View>
    <Text testID="refund-needs-admin-line" accessibilityLiveRegion="polite" className="text-destructive">
      {refundNeedsAdminLine(reason)}
    </Text>
    {message ? <Text testID="refund-needs-admin-message" className="text-muted-foreground">
      {message.slice(0, NEEDS_ADMIN_MESSAGE_MAX)}
    </Text> : null}
    {onCheckAgain ? <Button testID="refund-needs-admin-check-again" onPress={onCheckAgain}>
      <Text>Check again</Text>
    </Button> : null}
  </View>;
}
