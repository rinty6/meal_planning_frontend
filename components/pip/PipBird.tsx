import React from 'react';
import { AccessibilityInfo } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, type SvgProps } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type PipState =
  | 'happy'
  | 'sad'
  | 'confident'
  | 'care'
  | 'idle'
  | 'eating';

type PipOneShotState = Extract<PipState, 'happy' | 'eating'>;

export type PipBirdProps = Omit<SvgProps, 'width' | 'height' | 'viewBox'> & {
  /**
   * Set to false to force the static first-frame pose. System Reduce Motion
   * forces this off regardless of what is passed.
   */
  animated?: boolean;
  onAnimationComplete?: (state: PipOneShotState) => void;
  size?: number;
  state?: PipState;
};

/** Bottom-centre of the body group. Every squash and sway pivots here. */
const BASE_X = 100;
const BASE_Y = 168;

/**
 * Motion spec: never cut between states. Ease the outgoing state back to the
 * idle pose, hold a beat, then start the next one.
 *
 * The spec says "hold idle for one breath", but a full idle breath is 3000ms,
 * which would make a success dialog sit still for three seconds before Pip
 * reacts. A short beat reads the same and keeps dialogs responsive.
 */
const TRANSITION_MS = 200;
const IDLE_HOLD_MS = 200;

const palette = {
  accent: '#FF9500',
  accentDark: '#DD7B00',
  belly: '#FFF4E4',
  body: '#2B7BE0',
  cheek: '#FF7A6B',
  eye: '#0B2149',
  tear: '#7FB2F0',
  wing: '#1B5CB4',
} as const;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/*
 * ---------------------------------------------------------------------------
 * Matrix helpers
 *
 * react-native-svg's native views only understand `matrix` ([a, b, c, d, tx,
 * ty]). Its JS layer is what turns a `transform` string into that matrix, and
 * Reanimated writes props straight to the view without going through the JS
 * layer, so an animated `transform` string is silently dropped. Every animated
 * transform below is therefore composed into a matrix by hand.
 * ---------------------------------------------------------------------------
 */

type Matrix = [number, number, number, number, number, number];

/** Applies m2 first, then m1 (same order as an SVG transform list). */
function compose(m1: Matrix, m2: Matrix): Matrix {
  'worklet';
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function rotateAbout(degrees: number, cx: number, cy: number): Matrix {
  'worklet';
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

function scaleAbout(sx: number, sy: number, cx: number, cy: number): Matrix {
  'worklet';
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

function translate(tx: number, ty: number): Matrix {
  'worklet';
  return [1, 0, 0, 1, tx, ty];
}

/*
 * ---------------------------------------------------------------------------
 * Static pose data
 * ---------------------------------------------------------------------------
 */

type RestingPose = {
  leftWing: number;
  rightWing: number;
  wholeRotation: number;
};

function restingPose(state: PipState): RestingPose {
  switch (state) {
    case 'sad':
      return { leftWing: 16, rightWing: -16, wholeRotation: 0 };
    case 'confident':
      return { leftWing: -24, rightWing: 4, wholeRotation: 0 };
    case 'care':
      return { leftWing: 10, rightWing: -52, wholeRotation: -4.5 };
    case 'eating':
      return { leftWing: 12, rightWing: -46, wholeRotation: 0 };
    case 'idle':
      return { leftWing: 6, rightWing: -6, wholeRotation: 0 };
    case 'happy':
    default:
      return { leftWing: 8, rightWing: -8, wholeRotation: 0 };
  }
}

/** Centres used to scale/rotate accessories about themselves. */
const SPARKLE_A = { x: 170, y: 67 };
const SPARKLE_B = { x: 30, y: 83 };
const SPARKLE_CONFIDENT = { x: 176, y: 72.5 };
const HEART_A = { x: 52, y: 88 };
const HEART_B = { x: 27, y: 113 };
const TEAR_CENTRE = { x: 132, y: 135 };

/*
 * ---------------------------------------------------------------------------
 * Reduce Motion
 * ---------------------------------------------------------------------------
 */

/**
 * Reanimated's own useReducedMotion() snapshots the setting at app start and
 * never re-renders, so it is read straight from AccessibilityInfo here with a
 * change subscription.
 */
function useSystemReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setReduceMotion(enabled)
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

/*
 * ---------------------------------------------------------------------------
 * Static sub-shapes
 * ---------------------------------------------------------------------------
 */

function Feet() {
  return (
    <G
      fill="none"
      stroke={palette.accent}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={5}
    >
      <Path d="M84 156V170" />
      <Path d="M116 156V170" />
      <Path d="M74 177L84 170L94 177" />
      <Path d="M84 170V179" />
      <Path d="M106 177L116 170L126 177" />
      <Path d="M116 170V179" />
    </G>
  );
}

function Tuft({ state }: { state: PipState }) {
  const transform =
    state === 'sad'
      ? 'rotate(26 100 100) translate(4 6)'
      : state === 'confident'
        ? 'rotate(-6 100 100)'
        : undefined;

  return (
    <G fill={palette.body} transform={transform}>
      <Path d="M99 58C95 42 91 34 88 25C97 31 102 41 104 54Z" />
      <Path d="M104 56C107 41 111 33 118 26C118 37 113 48 109 58Z" />
    </G>
  );
}

function Eyes({ state }: { state: PipState }) {
  if (state === 'eating') {
    return (
      <G fill="none" stroke={palette.eye} strokeLinecap="round" strokeWidth={5.5}>
        <Path d="M67 104Q80 113 93 104" />
        <Path d="M107 104Q120 113 133 104" />
      </G>
    );
  }

  if (state === 'sad') {
    return (
      <>
        <Path
          d="M64 86Q78 92 92 88M136 86Q122 92 108 88"
          fill="none"
          opacity={0.85}
          stroke={palette.eye}
          strokeLinecap="round"
          strokeWidth={5}
        />
        <Circle cx={80} cy={108} fill="#fff" r={15} />
        <Circle cx={120} cy={108} fill="#fff" r={15} />
        <Circle cx={80} cy={112} fill={palette.eye} r={8.5} />
        <Circle cx={120} cy={112} fill={palette.eye} r={8.5} />
        <Circle cx={77} cy={109} fill="#fff" r={3} />
        <Circle cx={117} cy={109} fill="#fff" r={3} />
        <Path d="M65 100A15 15 0 0 1 95 100Z" fill={palette.wing} opacity={0.9} />
        <Path d="M105 100A15 15 0 0 1 135 100Z" fill={palette.wing} opacity={0.9} />
      </>
    );
  }

  const isConfident = state === 'confident';
  const isCare = state === 'care';

  return (
    <>
      {(isConfident || isCare) && (
        <Path
          d={
            isConfident
              ? 'M64 86Q79 80 94 86M108 80Q122 72 136 82'
              : 'M64 88Q79 82 94 88M106 88Q121 82 136 88'
          }
          fill="none"
          opacity={isCare ? 0.7 : 0.85}
          stroke={palette.eye}
          strokeLinecap="round"
          strokeWidth={5}
        />
      )}
      <Circle cx={80} cy={106} fill="#fff" r={15} />
      <Circle cx={120} cy={106} fill="#fff" r={15} />
      <Circle
        cx={isConfident ? 83 : 81}
        cy={isConfident || isCare ? 108 : 107}
        fill={palette.eye}
        r={isCare ? 8.5 : 8}
      />
      <Circle
        cx={isConfident ? 123 : 121}
        cy={isConfident || isCare ? 108 : 107}
        fill={palette.eye}
        r={isCare ? 8.5 : 8}
      />
      <Circle cx={isConfident ? 80 : 77.5} cy={isConfident ? 105 : 103.5} fill="#fff" r={3.2} />
      <Circle cx={isConfident ? 120 : 117.5} cy={isConfident ? 105 : 103.5} fill="#fff" r={3.2} />
      {isConfident && (
        <>
          <Path d="M65 100A15 15 0 0 1 95 100Z" fill={palette.wing} opacity={0.9} />
          <Path d="M105 100A15 15 0 0 1 135 100Z" fill={palette.wing} opacity={0.9} />
        </>
      )}
    </>
  );
}

/** The plate Pip holds out during Care. Lives inside the body group so it sways with him. */
function HeldPlate() {
  return (
    <>
      <Ellipse cx={178} cy={96} fill="#fff" rx={20} ry={6} stroke="#DAE2EC" strokeWidth={2} />
      <Ellipse cx={178} cy={93} fill={palette.accent} opacity={0.85} rx={13} ry={4.5} />
      <Circle cx={172} cy={91} fill="#10B981" r={3.4} />
      <Circle cx={183} cy={92} fill="#EF4444" r={3} />
    </>
  );
}

type AnimatedPropsObject = Record<string, unknown>;

type AccessoriesProps = {
  crumb: AnimatedPropsObject;
  heartA: AnimatedPropsObject;
  heartB: AnimatedPropsObject;
  sparkleA: AnimatedPropsObject;
  sparkleB: AnimatedPropsObject;
  state: PipState;
  tear: AnimatedPropsObject;
};

function Accessories({ crumb, heartA, heartB, sparkleA, sparkleB, state, tear }: AccessoriesProps) {
  if (state === 'happy') {
    return (
      <>
        <AnimatedG animatedProps={sparkleA as never} fill={palette.accent}>
          <Path d="M170 52l4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" />
        </AnimatedG>
        <AnimatedG animatedProps={sparkleB as never} fill={palette.accent}>
          <Path d="M30 72l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" />
        </AnimatedG>
      </>
    );
  }

  if (state === 'sad') {
    return (
      <>
        <Path
          d="M90 150Q100 144 110 150"
          fill="none"
          opacity={0.35}
          stroke={palette.eye}
          strokeLinecap="round"
          strokeWidth={3.5}
        />
        <AnimatedG animatedProps={tear as never}>
          <Path
            d="M132 124S139 133 139 138A7 7 0 0 1 125 138C125 133 132 124 132 124Z"
            fill={palette.tear}
          />
          <Circle cx={130} cy={136} fill="#fff" opacity={0.8} r={2} />
        </AnimatedG>
      </>
    );
  }

  if (state === 'confident') {
    return (
      <AnimatedG animatedProps={sparkleA as never}>
        <Path d="M176 60l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5Z" fill={palette.accent} />
      </AnimatedG>
    );
  }

  if (state === 'care') {
    return (
      <>
        <AnimatedG animatedProps={heartA as never}>
          <Path
            d="M40 84C40 76 52 74 52 84C52 74 64 76 64 84C64 93 52 102 52 102C52 102 40 93 40 84Z"
            fill={palette.cheek}
          />
        </AnimatedG>
        <AnimatedG animatedProps={heartB as never}>
          <Path
            d="M18 110C18 104 27 102.5 27 110C27 102.5 36 104 36 110C36 117 27 124 27 124C27 124 18 117 18 110Z"
            fill={palette.cheek}
          />
        </AnimatedG>
      </>
    );
  }

  if (state === 'eating') {
    return (
      <>
        <Ellipse cx={152} cy={150} fill="#fff" rx={16} ry={5} stroke="#DAE2EC" strokeWidth={2} />
        <Circle cx={148} cy={147} fill="#10B981" r={4} />
        <Circle cx={157} cy={148} fill="#EF4444" r={3.4} />
        <AnimatedG animatedProps={crumb as never}>
          <Circle cx={120} cy={142} fill={palette.accentDark} r={3} />
        </AnimatedG>
      </>
    );
  }

  return null;
}

/*
 * ---------------------------------------------------------------------------
 * Component
 * ---------------------------------------------------------------------------
 */

/**
 * Shared Pip SVG rig. All keyframes run from Reanimated shared values, so state
 * animation stays off the React render path.
 *
 * One-shot states (happy, eating) play their beats and then resolve into idle
 * on their own. To replay the same one-shot without changing `state`, remount
 * the component with a new `key`.
 */
export default function PipBird({
  accessibilityLabel,
  animated = true,
  onAnimationComplete,
  size = 76,
  state = 'idle',
  ...svgProps
}: PipBirdProps) {
  const systemReduceMotion = useSystemReduceMotion();
  const shouldAnimate = animated && !systemReduceMotion;

  const initialPose = restingPose(state);
  const [displayedState, setDisplayedState] = React.useState<PipState>(state);
  const displayedStateRef = React.useRef<PipState>(state);
  const onAnimationCompleteRef = React.useRef(onAnimationComplete);
  const transitionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(false);

  // Body
  const bodyY = useSharedValue(0);
  const wholeRotation = useSharedValue(initialPose.wholeRotation);
  const bodyScaleX = useSharedValue(1);
  const bodyScaleY = useSharedValue(1);
  const leftWing = useSharedValue(initialPose.leftWing);
  const rightWing = useSharedValue(initialPose.rightWing);
  const eyeScaleY = useSharedValue(1);
  const beakRotation = useSharedValue(0);
  const plateY = useSharedValue(0);
  // Shadow
  const shadowScaleX = useSharedValue(1);
  const shadowOpacity = useSharedValue(0.11);
  // Accessories
  const sparkleAOpacity = useSharedValue(0);
  const sparkleAScale = useSharedValue(0.2);
  const sparkleBOpacity = useSharedValue(0);
  const sparkleBScale = useSharedValue(0.2);
  const heartAOpacity = useSharedValue(0);
  const heartAY = useSharedValue(6);
  const heartAScale = useSharedValue(0.5);
  const heartBOpacity = useSharedValue(0);
  const heartBY = useSharedValue(6);
  const heartBScale = useSharedValue(0.5);
  const crumbOpacity = useSharedValue(0);
  const crumbX = useSharedValue(0);
  const crumbY = useSharedValue(0);
  const tearOpacity = useSharedValue(0);
  const tearScale = useSharedValue(0.4);
  const tearY = useSharedValue(0);

  React.useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  /* ---- animated props -------------------------------------------------- */

  const outerAnimatedProps = useAnimatedProps(() => ({
    matrix: compose(
      translate(0, bodyY.value),
      rotateAbout(wholeRotation.value, BASE_X, BASE_Y)
    ),
  }));
  const squashAnimatedProps = useAnimatedProps(() => ({
    matrix: scaleAbout(bodyScaleX.value, bodyScaleY.value, BASE_X, BASE_Y),
  }));
  const leftWingAnimatedProps = useAnimatedProps(() => ({
    matrix: rotateAbout(leftWing.value, 44, 120),
  }));
  const rightWingAnimatedProps = useAnimatedProps(() => ({
    matrix: rotateAbout(rightWing.value, 156, 120),
  }));
  const eyesAnimatedProps = useAnimatedProps(() => ({
    matrix: scaleAbout(1, eyeScaleY.value, 0, 106),
  }));
  const beakAnimatedProps = useAnimatedProps(() => ({
    matrix: rotateAbout(beakRotation.value, 100, 120),
  }));
  const plateAnimatedProps = useAnimatedProps(() => ({
    matrix: translate(0, plateY.value),
  }));
  const shadowAnimatedProps = useAnimatedProps(() => ({
    matrix: scaleAbout(shadowScaleX.value, 1, BASE_X, 184),
    opacity: shadowOpacity.value,
  }));
  const sparkleAAnimatedProps = useAnimatedProps(() => ({
    matrix: scaleAbout(sparkleAScale.value, sparkleAScale.value, SPARKLE_A.x, SPARKLE_A.y),
    opacity: sparkleAOpacity.value,
  }));
  const sparkleBAnimatedProps = useAnimatedProps(() => ({
    matrix: scaleAbout(sparkleBScale.value, sparkleBScale.value, SPARKLE_B.x, SPARKLE_B.y),
    opacity: sparkleBOpacity.value,
  }));
  const confidentSparkleAnimatedProps = useAnimatedProps(() => ({
    matrix: scaleAbout(
      sparkleAScale.value,
      sparkleAScale.value,
      SPARKLE_CONFIDENT.x,
      SPARKLE_CONFIDENT.y
    ),
    opacity: sparkleAOpacity.value,
  }));
  const heartAAnimatedProps = useAnimatedProps(() => ({
    matrix: compose(
      translate(0, heartAY.value),
      scaleAbout(heartAScale.value, heartAScale.value, HEART_A.x, HEART_A.y)
    ),
    opacity: heartAOpacity.value,
  }));
  const heartBAnimatedProps = useAnimatedProps(() => ({
    matrix: compose(
      translate(0, heartBY.value),
      scaleAbout(heartBScale.value, heartBScale.value, HEART_B.x, HEART_B.y)
    ),
    opacity: heartBOpacity.value,
  }));
  const crumbAnimatedProps = useAnimatedProps(() => ({
    matrix: translate(crumbX.value, crumbY.value),
    opacity: crumbOpacity.value,
  }));
  const tearAnimatedProps = useAnimatedProps(() => ({
    matrix: compose(
      translate(0, tearY.value),
      scaleAbout(tearScale.value, tearScale.value, TEAR_CENTRE.x, TEAR_CENTRE.y)
    ),
    opacity: tearOpacity.value,
  }));

  /* ---- animation lifecycle --------------------------------------------- */

  const stopAnimations = React.useCallback(() => {
    cancelAnimation(bodyY);
    cancelAnimation(wholeRotation);
    cancelAnimation(bodyScaleX);
    cancelAnimation(bodyScaleY);
    cancelAnimation(leftWing);
    cancelAnimation(rightWing);
    cancelAnimation(eyeScaleY);
    cancelAnimation(beakRotation);
    cancelAnimation(plateY);
    cancelAnimation(shadowScaleX);
    cancelAnimation(shadowOpacity);
    cancelAnimation(sparkleAOpacity);
    cancelAnimation(sparkleAScale);
    cancelAnimation(sparkleBOpacity);
    cancelAnimation(sparkleBScale);
    cancelAnimation(heartAOpacity);
    cancelAnimation(heartAY);
    cancelAnimation(heartAScale);
    cancelAnimation(heartBOpacity);
    cancelAnimation(heartBY);
    cancelAnimation(heartBScale);
    cancelAnimation(crumbOpacity);
    cancelAnimation(crumbX);
    cancelAnimation(crumbY);
    cancelAnimation(tearOpacity);
    cancelAnimation(tearScale);
    cancelAnimation(tearY);
  }, [
    beakRotation,
    bodyScaleX,
    bodyScaleY,
    bodyY,
    crumbOpacity,
    crumbX,
    crumbY,
    eyeScaleY,
    heartAOpacity,
    heartAScale,
    heartAY,
    heartBOpacity,
    heartBScale,
    heartBY,
    leftWing,
    plateY,
    rightWing,
    shadowOpacity,
    shadowScaleX,
    sparkleAOpacity,
    sparkleAScale,
    sparkleBOpacity,
    sparkleBScale,
    tearOpacity,
    tearScale,
    tearY,
    wholeRotation,
  ]);

  /**
   * Motion spec: cross-fade the outgoing state back toward idle, hold a beat,
   * then swap. Accessories fade out during the cross-fade so nothing pops.
   */
  const beginTransition = React.useCallback(
    (next: PipState) => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      stopAnimations();

      if (!shouldAnimate) {
        setDisplayedState(next);
        return;
      }

      const idle = restingPose('idle');
      const options = { duration: TRANSITION_MS, easing: Easing.out(Easing.quad) };

      bodyY.value = withTiming(0, options);
      wholeRotation.value = withTiming(idle.wholeRotation, options);
      bodyScaleX.value = withTiming(1, options);
      bodyScaleY.value = withTiming(1, options);
      leftWing.value = withTiming(idle.leftWing, options);
      rightWing.value = withTiming(idle.rightWing, options);
      eyeScaleY.value = withTiming(1, options);
      beakRotation.value = withTiming(0, options);
      shadowScaleX.value = withTiming(1, options);
      shadowOpacity.value = withTiming(0.11, options);
      sparkleAOpacity.value = withTiming(0, options);
      sparkleBOpacity.value = withTiming(0, options);
      heartAOpacity.value = withTiming(0, options);
      heartBOpacity.value = withTiming(0, options);
      crumbOpacity.value = withTiming(0, options);
      tearOpacity.value = withTiming(0, options);

      transitionTimer.current = setTimeout(() => {
        transitionTimer.current = null;
        setDisplayedState(next);
      }, TRANSITION_MS + IDLE_HOLD_MS);
    },
    [
      beakRotation,
      bodyScaleX,
      bodyScaleY,
      bodyY,
      crumbOpacity,
      eyeScaleY,
      heartAOpacity,
      heartBOpacity,
      leftWing,
      rightWing,
      shadowOpacity,
      shadowScaleX,
      shouldAnimate,
      sparkleAOpacity,
      sparkleBOpacity,
      stopAnimations,
      tearOpacity,
      wholeRotation,
    ]
  );

  const settleOneShot = React.useCallback(
    (completedState: PipOneShotState) => {
      onAnimationCompleteRef.current?.(completedState);
      beginTransition('idle');
    },
    [beginTransition]
  );

  // Requested state -> displayed state, via the cross-fade.
  React.useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (state === displayedStateRef.current) return;
    beginTransition(state);
  }, [beginTransition, state]);

  React.useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    []
  );

  // Runs the loop for whatever state is currently on screen.
  React.useEffect(() => {
    displayedStateRef.current = displayedState;

    const pose = restingPose(displayedState);
    const isEating = displayedState === 'eating';

    stopAnimations();

    bodyY.value = 0;
    wholeRotation.value = pose.wholeRotation;
    bodyScaleX.value = 1;
    bodyScaleY.value = 1;
    leftWing.value = pose.leftWing;
    rightWing.value = pose.rightWing;
    eyeScaleY.value = 1;
    beakRotation.value = 0;
    plateY.value = 0;
    shadowScaleX.value = 1;
    shadowOpacity.value = 0.11;
    crumbX.value = 0;
    crumbY.value = 0;
    tearScale.value = 0.4;
    tearY.value = 0;
    heartAY.value = 6;
    heartBY.value = 6;

    if (!shouldAnimate) {
      // Reduce Motion: hold the most legible frame of the state rather than a
      // literal frame 0, so the accessories that carry the emotion stay visible.
      sparkleAOpacity.value = 1;
      sparkleAScale.value = 1;
      sparkleBOpacity.value = 1;
      sparkleBScale.value = 1;
      heartAOpacity.value = 0.95;
      heartAScale.value = 1;
      heartBOpacity.value = 0.7;
      heartBScale.value = 1;
      crumbOpacity.value = isEating ? 1 : 0;
      tearOpacity.value = 1;
      tearScale.value = 1;
      tearY.value = 18;
      return stopAnimations;
    }

    sparkleAOpacity.value = 0;
    sparkleAScale.value = 0.2;
    sparkleBOpacity.value = 0;
    sparkleBScale.value = 0.2;
    heartAOpacity.value = 0;
    heartAScale.value = 0.5;
    heartBOpacity.value = 0;
    heartBScale.value = 0.5;
    crumbOpacity.value = 0;
    tearOpacity.value = 0;

    const startBlink = (cycle: number) => {
      // cycle is the full time between blinks, including the 160ms blink itself.
      eyeScaleY.value = withRepeat(
        withSequence(
          withDelay(cycle - 160, withTiming(0.08, { duration: 80 })),
          withTiming(1, { duration: 80 })
        ),
        -1,
        false
      );
    };

    const startSoftShadow = (half: number) => {
      shadowScaleX.value = withRepeat(
        withSequence(
          withTiming(0.95, { duration: half }),
          withTiming(1, { duration: half })
        ),
        -1,
        false
      );
      shadowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.09, { duration: half }),
          withTiming(0.11, { duration: half })
        ),
        -1,
        false
      );
    };

    const startSparkle = (
      opacity: typeof sparkleAOpacity,
      scale: typeof sparkleAScale,
      cycle: number,
      delay: number
    ) => {
      const half = cycle / 2;
      opacity.value = withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: half }), withTiming(0, { duration: half })),
          -1,
          false
        )
      );
      scale.value = withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: half }), withTiming(0.2, { duration: half })),
          -1,
          false
        )
      );
    };

    const startHeart = (
      opacity: typeof heartAOpacity,
      y: typeof heartAY,
      scale: typeof heartAScale,
      delay: number
    ) => {
      opacity.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(0.95, { duration: 528 }),
            withTiming(0, { duration: 1872 })
          ),
          -1,
          false
        )
      );
      y.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-54, { duration: 2400 }),
            // Reset instantly, otherwise the next loop starts at -54 and the
            // heart never travels again.
            withTiming(6, { duration: 0 })
          ),
          -1,
          false
        )
      );
      scale.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1.05, { duration: 2400 }),
            withTiming(0.5, { duration: 0 })
          ),
          -1,
          false
        )
      );
    };

    switch (displayedState) {
      case 'happy': {
        const hopEasing = Easing.bezier(0.3, 0, 0.35, 1);
        bodyY.value = withRepeat(
          withSequence(
            withTiming(-3, { duration: 170, easing: hopEasing }),
            withTiming(-24, { duration: 260, easing: hopEasing }),
            withTiming(0, { duration: 280, easing: hopEasing }),
            withDelay(240, withTiming(0, { duration: 0 }))
          ),
          2,
          false,
          (finished) => {
            if (finished) runOnJS(settleOneShot)('happy');
          }
        );
        bodyScaleX.value = withRepeat(
          withSequence(
            withTiming(1.12, { duration: 150, easing: hopEasing }),
            withTiming(0.95, { duration: 280, easing: hopEasing }),
            withTiming(1.09, { duration: 270, easing: hopEasing }),
            withTiming(1, { duration: 250, easing: hopEasing })
          ),
          2,
          false
        );
        bodyScaleY.value = withRepeat(
          withSequence(
            withTiming(0.88, { duration: 150, easing: hopEasing }),
            withTiming(1.07, { duration: 280, easing: hopEasing }),
            withTiming(0.91, { duration: 270, easing: hopEasing }),
            withTiming(1, { duration: 250, easing: hopEasing })
          ),
          2,
          false
        );
        leftWing.value = withRepeat(
          withSequence(
            withTiming(-48, { duration: 237.5 }),
            withTiming(pose.leftWing, { duration: 237.5 })
          ),
          4,
          false
        );
        rightWing.value = withRepeat(
          withSequence(
            withTiming(48, { duration: 237.5 }),
            withTiming(pose.rightWing, { duration: 237.5 })
          ),
          4,
          false
        );
        // Shadow shrinks as he leaves the ground; this is what sells the hop.
        shadowScaleX.value = withRepeat(
          withSequence(
            withTiming(0.68, { duration: 428 }),
            withTiming(1, { duration: 522 })
          ),
          2,
          false
        );
        shadowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.05, { duration: 428 }),
            withTiming(0.11, { duration: 522 })
          ),
          2,
          false
        );
        startSparkle(sparkleAOpacity, sparkleAScale, 1100, 0);
        startSparkle(sparkleBOpacity, sparkleBScale, 1100, 350);
        break;
      }
      case 'sad':
        bodyY.value = withRepeat(
          withSequence(withTiming(6, { duration: 1300 }), withTiming(0, { duration: 1300 })),
          -1,
          false
        );
        bodyScaleX.value = withRepeat(
          withSequence(withTiming(1.04, { duration: 1300 }), withTiming(1, { duration: 1300 })),
          -1,
          false
        );
        bodyScaleY.value = withRepeat(
          withSequence(withTiming(0.955, { duration: 1300 }), withTiming(1, { duration: 1300 })),
          -1,
          false
        );
        leftWing.value = withRepeat(
          withSequence(withTiming(23, { duration: 1300 }), withTiming(16, { duration: 1300 })),
          -1,
          false
        );
        rightWing.value = withRepeat(
          withSequence(withTiming(-23, { duration: 1300 }), withTiming(-16, { duration: 1300 })),
          -1,
          false
        );
        tearOpacity.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 364 }),
            withDelay(1508, withTiming(0, { duration: 728 }))
          ),
          -1,
          false
        );
        tearScale.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 364 }),
            withTiming(0.5, { duration: 2236 }),
            withTiming(0.4, { duration: 0 })
          ),
          -1,
          false
        );
        tearY.value = withRepeat(
          withSequence(
            withTiming(36, { duration: 1872 }),
            withTiming(46, { duration: 728 }),
            // Without this reset the tear ends at 46 and every later loop
            // drifts upward instead of falling.
            withTiming(0, { duration: 0 })
          ),
          -1,
          false
        );
        startSoftShadow(1300);
        startBlink(3600);
        break;
      case 'confident':
        bodyY.value = withRepeat(
          withSequence(withTiming(-5, { duration: 750 }), withTiming(0, { duration: 750 })),
          -1,
          false
        );
        bodyScaleX.value = withRepeat(
          withSequence(withTiming(1.07, { duration: 630 }), withTiming(1, { duration: 870 })),
          -1,
          false
        );
        bodyScaleY.value = withRepeat(
          withSequence(withTiming(1.05, { duration: 630 }), withTiming(1, { duration: 870 })),
          -1,
          false
        );
        leftWing.value = withRepeat(
          withSequence(withTiming(-30, { duration: 750 }), withTiming(-24, { duration: 750 })),
          -1,
          false
        );
        rightWing.value = withRepeat(
          withSequence(
            withTiming(-62, { duration: 600, easing: Easing.out(Easing.back(1.4)) }),
            withTiming(-54, { duration: 570 }),
            withTiming(4, { duration: 330 })
          ),
          -1,
          false
        );
        startSparkle(sparkleAOpacity, sparkleAScale, 1500, 0);
        startSoftShadow(750);
        startBlink(3600);
        break;
      case 'care':
        wholeRotation.value = withRepeat(
          withSequence(withTiming(4.5, { duration: 1100 }), withTiming(-4.5, { duration: 1100 })),
          -1,
          false
        );
        bodyScaleX.value = withRepeat(
          withSequence(withTiming(1.035, { duration: 1100 }), withTiming(1, { duration: 1100 })),
          -1,
          false
        );
        bodyScaleY.value = withRepeat(
          withSequence(withTiming(0.965, { duration: 1100 }), withTiming(1, { duration: 1100 })),
          -1,
          false
        );
        plateY.value = withRepeat(
          withSequence(withTiming(-5, { duration: 1100 }), withTiming(0, { duration: 1100 })),
          -1,
          false
        );
        startHeart(heartAOpacity, heartAY, heartAScale, 0);
        startHeart(heartBOpacity, heartBY, heartBScale, 1100);
        startSoftShadow(1100);
        startBlink(3600);
        break;
      case 'idle':
        bodyScaleX.value = withRepeat(
          withSequence(withTiming(1.035, { duration: 1500 }), withTiming(1, { duration: 1500 })),
          -1,
          false
        );
        bodyScaleY.value = withRepeat(
          withSequence(withTiming(0.965, { duration: 1500 }), withTiming(1, { duration: 1500 })),
          -1,
          false
        );
        startSoftShadow(1500);
        startBlink(3600);
        break;
      case 'eating':
        bodyY.value = withRepeat(
          withSequence(
            withTiming(-5, { duration: 175 }),
            withTiming(0, { duration: 175 }),
            withDelay(350, withTiming(0, { duration: 0 }))
          ),
          3,
          false,
          (finished) => {
            if (finished) runOnJS(settleOneShot)('eating');
          }
        );
        beakRotation.value = withRepeat(
          withSequence(withTiming(18, { duration: 350 }), withTiming(0, { duration: 350 })),
          3,
          false
        );
        crumbOpacity.value = withRepeat(
          withSequence(withTiming(1, { duration: 210 }), withTiming(0, { duration: 490 })),
          3,
          false
        );
        crumbX.value = withRepeat(
          withSequence(
            withTiming(-10, { duration: 700 }),
            // Reset, otherwise chomps 2 and 3 have no crumb to drop.
            withTiming(0, { duration: 0 })
          ),
          3,
          false
        );
        crumbY.value = withRepeat(
          withSequence(
            withTiming(14, { duration: 700 }),
            withTiming(0, { duration: 0 })
          ),
          3,
          false
        );
        startSoftShadow(350);
        break;
    }

    return stopAnimations;
  }, [
    beakRotation,
    bodyScaleX,
    bodyScaleY,
    bodyY,
    crumbOpacity,
    crumbX,
    crumbY,
    displayedState,
    eyeScaleY,
    heartAOpacity,
    heartAScale,
    heartAY,
    heartBOpacity,
    heartBScale,
    heartBY,
    leftWing,
    plateY,
    rightWing,
    settleOneShot,
    shadowOpacity,
    shadowScaleX,
    shouldAnimate,
    sparkleAOpacity,
    sparkleAScale,
    sparkleBOpacity,
    sparkleBScale,
    stopAnimations,
    tearOpacity,
    tearScale,
    tearY,
    wholeRotation,
  ]);

  /* ---- render ---------------------------------------------------------- */

  const pose = restingPose(displayedState);
  const isSad = displayedState === 'sad';
  // Static transform strings keep the very first paint correct: react-native-svg
  // converts these to a matrix during render, before Reanimated's first tick.
  const outerTransform =
    pose.wholeRotation === 0 ? undefined : `rotate(${pose.wholeRotation} ${BASE_X} ${BASE_Y})`;

  return (
    <Svg
      accessibilityLabel={accessibilityLabel ?? `Pip is ${displayedState}`}
      accessibilityRole="image"
      height={size}
      viewBox="0 0 200 200"
      width={size}
      {...svgProps}
    >
      <AnimatedEllipse
        animatedProps={shadowAnimatedProps as never}
        cx={100}
        cy={184}
        fill={palette.eye}
        rx={isSad ? 46 : 42}
        ry={isSad ? 7 : 6.5}
      />
      <AnimatedG animatedProps={outerAnimatedProps as never} transform={outerTransform}>
        {/* Feet sit outside the squash group so they stay planted, as in the design. */}
        <Feet />
        <AnimatedG animatedProps={squashAnimatedProps as never}>
          <Tuft state={displayedState} />
          <Ellipse cx={100} cy={112} fill={palette.body} rx={58} ry={56} />
          <AnimatedG
            animatedProps={leftWingAnimatedProps as never}
            transform={`rotate(${pose.leftWing} 44 120)`}
          >
            <Ellipse
              cx={44}
              cy={isSad ? 122 : 120}
              fill={palette.wing}
              rx={isSad ? 14 : 15}
              ry={isSad ? 29 : 28}
            />
          </AnimatedG>
          <AnimatedG
            animatedProps={rightWingAnimatedProps as never}
            transform={`rotate(${pose.rightWing} 156 120)`}
          >
            <Ellipse
              cx={156}
              cy={isSad ? 122 : 120}
              fill={palette.wing}
              rx={isSad ? 14 : 15}
              ry={isSad ? 29 : 28}
            />
          </AnimatedG>
          <Ellipse cx={100} cy={132} fill={palette.belly} rx={36} ry={32} />
          <Ellipse
            cx={60}
            cy={isSad ? 130 : 128}
            fill={palette.cheek}
            opacity={isSad ? 0.3 : 0.45}
            rx={10}
            ry={isSad ? 6 : 6.5}
          />
          <Ellipse
            cx={140}
            cy={isSad ? 130 : 128}
            fill={palette.cheek}
            opacity={isSad ? 0.3 : 0.45}
            rx={10}
            ry={isSad ? 6 : 6.5}
          />
          <AnimatedG animatedProps={eyesAnimatedProps as never}>
            <Eyes state={displayedState} />
          </AnimatedG>
          <AnimatedG animatedProps={beakAnimatedProps as never}>
            <Path d="M100 120L88 130L112 130Z" fill={palette.accent} />
          </AnimatedG>
          <Path
            d={
              displayedState === 'confident'
                ? 'M88 129Q104 142 112 129Z'
                : isSad
                  ? 'M88 130Q100 142 112 130Z'
                  : 'M88 130Q100 144 112 130Z'
            }
            fill={palette.accentDark}
          />
          {displayedState === 'care' && (
            <AnimatedG animatedProps={plateAnimatedProps as never}>
              <HeldPlate />
            </AnimatedG>
          )}
        </AnimatedG>
      </AnimatedG>
      <Accessories
        crumb={crumbAnimatedProps}
        heartA={heartAAnimatedProps}
        heartB={heartBAnimatedProps}
        sparkleA={
          displayedState === 'confident' ? confidentSparkleAnimatedProps : sparkleAAnimatedProps
        }
        sparkleB={sparkleBAnimatedProps}
        state={displayedState}
        tear={tearAnimatedProps}
      />
    </Svg>
  );
}
