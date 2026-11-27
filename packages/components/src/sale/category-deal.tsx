import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { Animated, Platform, type View } from 'react-native';
import { CROSSFADE, EASE, EASE_BEAT, EASE_EXIT, FADE_IN_BY, MEASURE_GRACE, NEW_TILES, OLD_TILES, PANE, SCALE_FROM } from '../lib/motion';
import { useReducedMotion } from '../lib/use-reduced-motion';

/**
 * The category deal (PARITY row 10): a category opened by its tile deals its products out of that tile, and going
 * back gathers them into it. The feel and figures are WCPOS v2's deal stack (packages/core/src/screens/main/pos/
 * products/deal-stack.tsx, DealCell 551-712); the parts are not. Here each cell measures itself against the tapped
 * tile's window frame and travels the difference, on RN Animated.
 */

interface Frame { x: number; y: number }
/** Anything that measures in the window, as a View's host node does. */
type Measurable = Pick<View, 'measureInWindow'>;

interface DealState {
  generation: number;
  /** Out (or at rest in the level) when true; gathering when false. */
  dealt: boolean;
  /** The tapped tile's frame: undefined while it is measured, null when it could not be. */
  origin: Frame | null | undefined;
  /** The open category's id; null is All products. */
  id: string | null;
  landed: boolean;
}

interface CategoryDeal {
  open(node: Measurable | undefined, run: () => void, id?: string | null): void;
  back(run: () => void): void;
  /** The tile the last gather went home to, until the root's fade is done; undefined when there was none. */
  returningId: string | null | undefined;
}

interface Stage extends CategoryDeal, DealState {
  still: boolean;
  /** Whether a cell mounting now came after the deal's first commit (the list's next batch). */
  late(): boolean;
  /** Counts a mounted cell; the returned function uncounts it. */
  enter(): () => void;
}

const DealContext = createContext<Stage | null>(null);
const REST: DealState = { generation: 0, dealt: false, origin: null, id: null, landed: true };
// The whole deal: the parent's walk, or the capped stagger of the tiles and one landing (v2 deal-stack.tsx:128-133).
const DEAL_SPAN = Math.max(PANE, (NEW_TILES.cap - 1) * NEW_TILES.step + NEW_TILES.duration);
const GATHER_SPAN = Math.max(PANE, (OLD_TILES.cap - 1) * OLD_TILES.step + OLD_TILES.duration);
const useNativeDriver = Platform.OS !== 'web';
const OUTSIDE: CategoryDeal = { open: (_node, run) => run(), back: (run) => run(), returningId: undefined };

function measure(node: Measurable, done: (frame: Frame | null) => void) {
  // react-native-web measures in a timeout, by when a root tile the tap swapped out has left the page and reads all
  // zero; its rect is read now and used when the later measure comes back empty.
  const now = (node as { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } })
    .getBoundingClientRect?.();
  node.measureInWindow((x, y, width, height) => {
    if (width > 0 || height > 0) done({ x, y });
    else done(now && (now.width > 0 || now.height > 0) ? { x: now.left, y: now.top } : null);
  });
}

/** Holds the deal for the cells under it; a function child is handed the deal itself. */
export function DealStage({ children }: { children: ReactNode | ((deal: CategoryDeal) => ReactNode) }): JSX.Element {
  // Reduced motion, or not known yet: nothing deals (as MotionRows).
  const still = useReducedMotion() !== false;
  const [deal, setDeal] = useState(REST);
  const [returningId, setReturningId] = useState<string | null | undefined>(undefined);
  const live = useRef(deal);
  live.current = deal;
  const firstCommit = useRef(-1);
  const gathering = useRef(false);
  const cells = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  // Runs after the cells' own layout effects, so a cell mounting in the deal's first commit is not late.
  useLayoutEffect(() => { firstCommit.current = -1; });
  const [fixed] = useState(() => ({
    later(run: () => void, ms: number) {
      const timer = setTimeout(() => { timers.current.delete(timer); run(); }, ms);
      timers.current.add(timer);
    },
    late: () => firstCommit.current !== live.current.generation,
    enter() {
      cells.current += 1;
      return () => {
        cells.current -= 1;
        // The level's grid went without a gather (a search, the table view): what comes next is not dealt. Checked a
        // tick later, so a grid remounted in one commit (a new column count) keeps its deal.
        fixed.later(() => {
          if (cells.current === 0 && !gathering.current) setDeal((d) => (d.dealt ? { ...REST, generation: d.generation } : d));
        }, 0);
      };
    },
  }));
  const stage = useMemo((): Stage => ({
    ...deal, still, returningId, late: fixed.late, enter: fixed.enter,
    open(node, run, id = null) {
      if (still) return run();
      const generation = live.current.generation + 1;
      firstCommit.current = generation;
      setReturningId(undefined);
      setDeal({ generation, dealt: true, origin: undefined, id, landed: false });
      const settle = (origin: Frame | null) =>
        setDeal((d) => (d.generation !== generation || d.origin !== undefined ? d : { ...d, origin }));
      if (node) measure(node, (frame) => {
        settle(frame);
        if (frame) fixed.later(() => setDeal((d) => (d.generation === generation ? { ...d, landed: true } : d)), DEAL_SPAN);
      });
      // A tap is never lost to a measurement: the level opens now, and rests in place if the frame never comes.
      fixed.later(() => settle(null), MEASURE_GRACE);
      run();
    },
    back(run) {
      const d = live.current;
      if (gathering.current) return;
      if (still || !d.dealt || !d.origin || cells.current === 0) return run();
      gathering.current = true;
      setDeal({ ...d, dealt: false });
      // The real back runs on a timer, never on an animation's end, so a dropped frame cannot lose it.
      fixed.later(() => {
        gathering.current = false;
        setDeal({ ...REST, generation: d.generation });
        setReturningId(d.id);
        fixed.later(() => setReturningId(undefined), CROSSFADE);
        run();
      }, GATHER_SPAN);
    },
  }), [deal, still, returningId, fixed]);
  return <DealContext.Provider value={stage}>{typeof children === 'function' ? children(stage) : children}</DealContext.Provider>;
}

export function useCategoryDeal(): CategoryDeal {
  return useContext(DealContext) ?? OUTSIDE;
}

/** One slot of a dealt level: slot 0 is the parent, which walks from the tapped tile; the rest land in turn. */
export function DealCell({ index, count, children }: { index: number; count: number; children: ReactNode }): JSX.Element {
  const stage = useContext(DealContext);
  return stage ? <Cell stage={stage} index={index} count={count}>{children}</Cell> : <>{children}</>;
}

function Cell({ stage, index, count, children }: { stage: Stage; index: number; count: number; children: ReactNode }) {
  const ref = useRef<View>(null);
  const parent = index === 0;
  const { origin, dealt, landed, enter, late } = stage;
  // A cell joins only a deal still in the air; one that mounts after it landed, or with no deal, is where it belongs.
  const [joins] = useState(() => stage.dealt && !stage.landed && stage.origin !== null && !stage.still);
  const [frame, setFrame] = useState<Frame | null | undefined>(joins ? undefined : null);
  const [motion] = useState(() => {
    const t = new Animated.Value(1);
    const offset = new Animated.ValueXY();
    const shown = new Animated.Value(joins ? 0 : 1);
    const travel = t.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' });
    const translate = [{ translateX: Animated.multiply(offset.x, travel) }, { translateY: Animated.multiply(offset.y, travel) }];
    // The parent walks; a product tile is whole by FADE_IN_BY of its travel and grows from SCALE_FROM.
    const style = parent ? { opacity: shown, transform: translate } : {
      opacity: Animated.multiply(shown, t.interpolate({ inputRange: [0, FADE_IN_BY, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' })),
      transform: [...translate, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [SCALE_FROM, 1], extrapolate: 'clamp' }) }],
    };
    return { t, offset, shown, style };
  });
  const from = useRef<Frame | null>(null);
  const turnLate = useRef(false);
  const armed = useRef(false);
  const homing = useRef(false);
  const dealtNow = useRef(dealt);
  dealtNow.current = dealt;
  // The start frame outlives a new index (a reorder): it is cancelled only when the cell goes.
  const startFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(startFrame.current), []);
  useLayoutEffect(() => enter(), [enter]);
  useLayoutEffect(() => {
    if (!joins) return;
    turnLate.current = late();
    if (ref.current) measure(ref.current, (f) => setFrame((was) => (was === undefined ? f : was)));
    // Hidden only until the offset is known, and never longer than the grace.
    const grace = setTimeout(() => setFrame((was) => (was === undefined ? null : was)), MEASURE_GRACE);
    return () => clearTimeout(grace);
  }, [joins, late]);
  useLayoutEffect(() => {
    if (!joins || armed.current || frame === undefined || origin === undefined) return;
    armed.current = true;
    const { t, offset, shown } = motion;
    // A cell armed once the gather began is shown where it is, with no start pose and no out.
    if (frame && origin && dealt) {
      from.current = { x: origin.x - frame.x, y: origin.y - frame.y };
      offset.setValue(from.current);
      t.setValue(0);
    }
    shown.setValue(1);
    if (!from.current) return;
    const turn = turnLate.current ? 0 : index - 1;
    const out = Animated.timing(t, parent
      ? { toValue: 1, duration: PANE, delay: 0, easing: EASE, useNativeDriver }
      : { toValue: 1, duration: NEW_TILES.duration, delay: Math.min(turn, NEW_TILES.cap - 1) * NEW_TILES.step, easing: EASE_BEAT, useNativeDriver });
    // Started on the next frame, so the first frame painted is the one on the tapped tile; not once the gather began.
    startFrame.current = requestAnimationFrame(() => { if (!homing.current && dealtNow.current) out.start(); });
  }, [joins, frame, origin, dealt, index, parent, motion]);
  useEffect(() => {
    if (dealt || !origin) { homing.current = false; return; }
    if (homing.current) return;
    homing.current = true;
    const { t, offset, shown } = motion;
    const gather = (start: Frame) => {
      t.stopAnimation();
      offset.setValue(start);
      shown.setValue(1);
      // Last out is first home, speeding up into the parent.
      Animated.timing(t, parent
        ? { toValue: 0, duration: PANE, delay: 0, easing: EASE_EXIT, useNativeDriver }
        : { toValue: 0, duration: OLD_TILES.duration, easing: EASE_EXIT, useNativeDriver,
          delay: Math.min(Math.max(0, count - 1 - index), OLD_TILES.cap - 1) * OLD_TILES.step }).start();
    };
    // A landed cell is measured again, at rest, so a scrolled grid gathers from where it is.
    if (from.current && !landed) gather(from.current);
    else if (ref.current) measure(ref.current, (f) => f && gather({ x: origin.x - f.x, y: origin.y - f.y }));
  }, [dealt, origin, landed, count, index, parent, motion]);
  return <Animated.View ref={ref} collapsable={false} style={motion.style}>{children}</Animated.View>;
}
