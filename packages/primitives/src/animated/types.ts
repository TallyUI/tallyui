import type { ViewStyle } from 'react-native';

/**
 * Configuration for an enter/exit animation.
 */
interface AnimationConfig {
  /** Style when entering (becoming visible) */
  entering?: ViewStyle;
  /** Style when exiting (becoming hidden) */
  exiting?: ViewStyle;
  /** Duration in ms */
  duration?: number;
}

/**
 * Props for the Presence component that manages mount/unmount transitions.
 */
interface PresenceProps {
  /** Whether the content should be visible */
  present: boolean;
  /** If true, always keep in DOM (but animate opacity/transform) */
  forceMount?: boolean;
  children: React.ReactNode | ((props: { present: boolean }) => React.ReactNode);
}

/**
 * Return type for usePresence hook
 */
interface PresenceState {
  /** Whether the content is currently mounted (may lag behind `present` for exit animations) */
  isPresent: boolean;
  /** Ref callback to attach to the animated element */
  ref: React.RefCallback<any>;
}

export type { AnimationConfig, PresenceProps, PresenceState };
