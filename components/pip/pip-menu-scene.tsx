import React from 'react';
import { AccessibilityInfo, type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type PipMenuSceneName = 'cooking' | 'workout';

export type PipMenuSceneProps = {
  accessibilityLabel?: string;
  animated?: boolean;
  scene: PipMenuSceneName;
  style?: StyleProp<ViewStyle>;
};

const palette = {
  accent: '#FF9500',
  accentDark: '#DD7B00',
  belly: '#FFF4E4',
  body: '#2B7BE0',
  cheek: '#FF7A6B',
  eye: '#0B2149',
  sweat: '#7FB2F0',
  wing: '#1B5CB4',
} as const;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Matrix = [number, number, number, number, number, number];

function compose(first: Matrix, second: Matrix): Matrix {
  'worklet';
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function rotateAbout(degrees: number, cx: number, cy: number): Matrix {
  'worklet';
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine,
    sine,
    -sine,
    cosine,
    cx - cosine * cx + sine * cy,
    cy - sine * cx - cosine * cy,
  ];
}

function scaleAbout(scaleX: number, scaleY: number, cx: number, cy: number): Matrix {
  'worklet';
  return [scaleX, 0, 0, scaleY, cx - scaleX * cx, cy - scaleY * cy];
}

function translate(x: number, y: number): Matrix {
  'worklet';
  return [1, 0, 0, 1, x, y];
}

function useSystemReduceMotion() {
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function startLoop(
  value: SharedValue<number>,
  duration: number,
  delay = 0,
  easing = Easing.linear
) {
  value.value = withDelay(
    delay,
    withRepeat(
      withSequence(
        withTiming(1, { duration, easing }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    )
  );
}

type CookingSceneProps = {
  backgroundId: string;
  clipId: string;
  glowId: string;
  shouldAnimate: boolean;
};

function CookingScene({ backgroundId, clipId, glowId, shouldAnimate }: CookingSceneProps) {
  const breath = useSharedValue(0);
  const stir = useSharedValue(0);
  const hat = useSharedValue(0);
  const blink = useSharedValue(0);
  const bubbleA = useSharedValue(0);
  const bubbleB = useSharedValue(0);
  const bubbleC = useSharedValue(0);
  const juiceBubble = useSharedValue(0);
  const steamA = useSharedValue(0);
  const steamB = useSharedValue(0);
  const steamC = useSharedValue(0);

  const bodyBobProps = useAnimatedProps(() => ({
    matrix: translate(0, interpolate(breath.value, [0, 1], [0, -5])),
  }));
  const bodyBreathProps = useAnimatedProps(() => ({
    matrix: scaleAbout(
      interpolate(breath.value, [0, 1], [1, 1.035]),
      interpolate(breath.value, [0, 1], [1, 0.965]),
      100,
      168
    ),
  }));
  const shadowProps = useAnimatedProps(() => ({
    matrix: scaleAbout(interpolate(breath.value, [0, 1], [1, 0.95]), 1, 81, 178),
    opacity: interpolate(breath.value, [0, 1], [0.11, 0.09]),
  }));
  const crestProps = useAnimatedProps(() => ({
    matrix: rotateAbout(interpolate(hat.value, [0, 1], [58, 65]), 103, 58),
  }));
  const hatProps = useAnimatedProps(() => ({
    matrix: rotateAbout(interpolate(hat.value, [0, 1], [-16, -12]), 88, 60),
  }));
  const wingProps = useAnimatedProps(() => ({
    matrix: rotateAbout(interpolate(stir.value, [0, 1], [-45, -37]), 156, 96.5),
  }));
  const spoonProps = useAnimatedProps(() => ({
    matrix: rotateAbout(interpolate(stir.value, [0, 1], [-3, 5]), 156, 98),
  }));
  const blinkProps = useAnimatedProps(() => ({
    matrix: scaleAbout(1, interpolate(blink.value, [0, 1], [1, 0.08]), 100, 106),
  }));

  const useBubbleProps = (progress: SharedValue<number>, cx: number, cy: number) =>
    useAnimatedProps(() => {
      const scale = interpolate(progress.value, [0, 0.4, 1], [0.3, 0.8, 1.15]);
      return {
        matrix: compose(
          translate(0, interpolate(progress.value, [0, 1], [3, -5])),
          scaleAbout(scale, scale, cx, cy)
        ),
        opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.95, 0]),
      };
    });

  const bubbleAProps = useBubbleProps(bubbleA, 171, 110);
  const bubbleBProps = useBubbleProps(bubbleB, 181, 109);
  const bubbleCProps = useBubbleProps(bubbleC, 190, 110.5);
  const juiceBubbleProps = useBubbleProps(juiceBubble, 296, 128);

  const useSteamProps = (progress: SharedValue<number>, cx: number, cy: number) =>
    useAnimatedProps(() => {
      const scale = interpolate(progress.value, [0, 1], [0.55, 1.3]);
      return {
        matrix: compose(
          translate(0, interpolate(progress.value, [0, 1], [6, -40])),
          scaleAbout(scale, scale, cx, cy)
        ),
        opacity: interpolate(progress.value, [0, 0.22, 1], [0, 0.7, 0]),
      };
    });

  const steamAProps = useSteamProps(steamA, 168, 102);
  const steamBProps = useSteamProps(steamB, 181, 100);
  const steamCProps = useSteamProps(steamC, 193, 102);

  // Audit: This effect owns every Cooking loop and resets all values when the hero is hidden.
  React.useEffect(() => {
    const values = [
      breath,
      stir,
      hat,
      blink,
      bubbleA,
      bubbleB,
      bubbleC,
      juiceBubble,
      steamA,
      steamB,
      steamC,
    ];
    values.forEach((value) => {
      cancelAnimation(value);
      value.value = 0;
    });

    if (!shouldAnimate) return;

    breath.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    stir.value = withRepeat(
      withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    hat.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    blink.value = withRepeat(
      withSequence(
        withDelay(3060, withTiming(1, { duration: 170 })),
        withTiming(0, { duration: 170 })
      ),
      -1,
      false
    );
    startLoop(bubbleA, 1400);
    startLoop(bubbleB, 1400, 500);
    startLoop(bubbleC, 1400, 950);
    startLoop(juiceBubble, 1900, 300);
    startLoop(steamA, 2600, 0, Easing.out(Easing.ease));
    startLoop(steamB, 2600, 800, Easing.out(Easing.ease));
    startLoop(steamC, 2600, 1600, Easing.out(Easing.ease));

    return () => values.forEach(cancelAnimation);
  }, [
    blink,
    breath,
    bubbleA,
    bubbleB,
    bubbleC,
    hat,
    juiceBubble,
    shouldAnimate,
    steamA,
    steamB,
    steamC,
    stir,
  ]);

  return (
    <>
      <Defs>
        <LinearGradient id={backgroundId} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFF3E2" />
          <Stop offset="1" stopColor="#FFFDF8" />
        </LinearGradient>
        <RadialGradient id={glowId}>
          <Stop offset="0" stopColor="#FFD9A0" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFD9A0" stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={clipId}>
          <Rect height={200} width={340} />
        </ClipPath>
      </Defs>
      <G clipPath={'url(#' + clipId + ')'}>
        <Rect fill={'url(#' + backgroundId + ')'} height={200} width={340} />
        <Circle cx={84} cy={108} fill={'url(#' + glowId + ')'} r={86} />
        <Rect fill="#EFDDC0" height={30} opacity={0.55} width={340} y={170} />
        <G fill="#A97F52" opacity={0.16}>
          <Rect height={4} rx={2} width={114} x={230} y={12} />
          <Rect height={12} rx={2.5} width={5} x={255.5} y={16} />
          <Circle cx={258} cy={40} r={14} />
          <Rect height={14} rx={2.5} width={5} x={297.5} y={16} />
          <Ellipse cx={300} cy={42} rx={10} ry={14} />
        </G>
        <Rect fill="#F3E2C8" height={40} width={200} x={146} y={146} />
        <Rect fill="#FFFFFF" height={20} opacity={0.38} rx={4} width={74} x={163} y={157} />
        <Rect fill="#FFFFFF" height={20} opacity={0.38} rx={4} width={74} x={249} y={157} />
        <Rect
          fill="#FFFFFF"
          height={10}
          rx={5}
          stroke="#E4D3B8"
          strokeWidth={1.6}
          width={208}
          x={142}
          y={138}
        />
        <Path d="M155 116q-10 5 0 11" fill="none" stroke="#414A57" strokeLinecap="round" strokeWidth={4} />
        <Path d="M205 116q10 5 0 11" fill="none" stroke="#414A57" strokeLinecap="round" strokeWidth={4} />
        <Rect fill="#5B6472" height={28} rx={6} width={50} x={155} y={110} />
        <Path d="M164 118q-2 9 1 14" fill="none" opacity={0.16} stroke="#FFFFFF" strokeLinecap="round" strokeWidth={3.5} />
        <Ellipse cx={180} cy={110} fill="#414A57" rx={27} ry={7} />
        <Ellipse cx={180} cy={110} fill="#FFB020" rx={21.5} ry={5} />
        <AnimatedCircle animatedProps={bubbleAProps as never} cx={171} cy={110} fill="#FFE7BC" r={2} />
        <AnimatedCircle animatedProps={bubbleBProps as never} cx={181} cy={109} fill="#FFE7BC" r={2.4} />
        <AnimatedCircle animatedProps={bubbleCProps as never} cx={190} cy={110.5} fill="#FFE7BC" r={1.8} />
        <Rect fill="#E0BE8C" height={9} rx={4.5} width={62} x={212} y={129} />
        <Rect fill="#E0BE8C" height={4.5} rx={2.2} width={13} x={272} y={131.5} />
        <Circle cx={224} cy={121} fill="#EF4444" r={8} />
        <Circle cx={224} cy={121} fill="#FCA5A5" r={4.6} />
        <Circle cx={222.4} cy={119.6} fill="#EF4444" r={1} />
        <Circle cx={225.8} cy={122.2} fill="#EF4444" r={1} />
        <Rect fill="#FF9500" height={15} rx={2.5} width={5} x={238} y={114} />
        <Rect fill="#FFAE38" height={12} rx={2.5} width={5} x={245.5} y={117} />
        <Rect fill="#FF9500" height={17} rx={2.5} width={5} x={253} y={112} />
        <Rect fill="#15803D" height={10} width={4.5} x={264.5} y={119} />
        <Circle cx={262} cy={116} fill="#22C55E" r={5.8} />
        <Circle cx={270} cy={115.4} fill="#22C55E" r={5.2} />
        <Circle cx={266} cy={111} fill="#34D399" r={5} />
        <Path d="M288 106l2.5 32h13l2.5-32Z" fill="#FFFFFF" opacity={0.6} stroke="#DCE6F0" strokeWidth={1.5} />
        <Path d="M289.6 116l1.4 20.4h12l1.4-20.4Z" fill="#FF9500" opacity={0.92} />
        <Path d="M299 111l8-19" stroke="#FF7A6B" strokeLinecap="round" strokeWidth={3.2} />
        <Ellipse cx={297} cy={106} fill="#FFFFFF" opacity={0.8} rx={9} ry={2.4} />
        <AnimatedCircle animatedProps={juiceBubbleProps as never} cx={296} cy={128} fill="#FFE7BC" r={1.8} />
        <Rect fill="#BFDBFE" height={36} opacity={0.9} rx={7} stroke="#93C5FD" strokeWidth={1.5} width={17} x={316} y={102} />
        <Rect fill="#2B7BE0" height={8} rx={2.8} width={9} x={320} y={95} />
        <Rect fill="#2B7BE0" height={8} opacity={0.3} width={17} x={316} y={115} />

        <AnimatedEllipse animatedProps={shadowProps as never} cx={81} cy={178} fill={palette.eye} rx={35} ry={5.8} />
        <G transform="translate(6 39) scale(0.75)">
          <G fill="none" stroke={palette.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5}>
            <Path d="M84 156v14M116 156v14M74 177l10-7 10 7M84 170v9M106 177l10-7 10 7M116 170v9" />
          </G>
          <AnimatedG animatedProps={bodyBobProps as never}>
            <AnimatedG animatedProps={bodyBreathProps as never}>
              <AnimatedG animatedProps={crestProps as never} fill={palette.body} transform="rotate(58 103 58)">
                <Path d="M99 58C95 42 91 34 88 25C97 31 102 41 104 54ZM104 56C107 41 111 33 118 26C118 37 113 48 109 58Z" />
              </AnimatedG>
              <Ellipse cx={100} cy={112} fill={palette.body} rx={58} ry={56} />
              <Ellipse cx={44} cy={120} fill={palette.wing} rx={15} ry={28} transform="rotate(11 44 96)" />
              <Ellipse cx={100} cy={132} fill={palette.belly} rx={36} ry={32} />
              <Ellipse cx={60} cy={128} fill={palette.cheek} opacity={0.5} rx={10} ry={6.5} />
              <Ellipse cx={140} cy={128} fill={palette.cheek} opacity={0.5} rx={10} ry={6.5} />
              <Path d="M64 88q15-6 30 0M106 88q15-6 30 0" fill="none" opacity={0.7} stroke={palette.eye} strokeLinecap="round" strokeWidth={5} />
              <AnimatedG animatedProps={blinkProps as never}>
                <Circle cx={80} cy={106} fill="#FFFFFF" r={15} />
                <Circle cx={120} cy={106} fill="#FFFFFF" r={15} />
                <Circle cx={83} cy={107} fill={palette.eye} r={8.5} />
                <Circle cx={123} cy={107} fill={palette.eye} r={8.5} />
                <Circle cx={79.5} cy={103.5} fill="#FFFFFF" r={3.4} />
                <Circle cx={119.5} cy={103.5} fill="#FFFFFF" r={3.4} />
              </AnimatedG>
              <Path d="M100 120l-12 10h24Z" fill={palette.accent} />
              <Path d="M88 130q12 15 24 0Z" fill={palette.accentDark} />
              <AnimatedG animatedProps={hatProps as never} transform="rotate(-16 88 60)">
                <G fill="#E4D8C4">
                  <Circle cx={66} cy={42} r={18} />
                  <Circle cx={88} cy={33} r={21} />
                  <Circle cx={107} cy={44} r={16} />
                </G>
                <G fill="#FFFFFF">
                  <Circle cx={66} cy={42} r={16} />
                  <Circle cx={88} cy={33} r={19} />
                  <Circle cx={107} cy={44} r={14} />
                </G>
                <Rect fill="#FFFFFF" height={14} rx={5} stroke="#E4D8C4" strokeWidth={1.8} width={56} x={56} y={52} />
              </AnimatedG>
              <AnimatedG animatedProps={wingProps as never} transform="rotate(-45 156 96.5)">
                <Ellipse cx={156} cy={120} fill={palette.wing} rx={15} ry={28} />
              </AnimatedG>
              <AnimatedG animatedProps={spoonProps as never} transform="rotate(-3 156 98)">
                <Path d="M190 135l31-32" fill="none" stroke="#C68642" strokeLinecap="round" strokeWidth={5.5} />
                <Ellipse cx={225} cy={99} fill="#B0763A" rx={8} ry={5.5} transform="rotate(-34 225 99)" />
              </AnimatedG>
            </AnimatedG>
          </AnimatedG>
        </G>
        <G fill="none" stroke="#C9B79F" strokeLinecap="round" strokeWidth={3.4}>
          <AnimatedPath animatedProps={steamAProps as never} d="M168 102c-5-7 5-11 0-18" />
          <AnimatedPath animatedProps={steamBProps as never} d="M181 100c-5-8 5-12 0-20" />
          <AnimatedPath animatedProps={steamCProps as never} d="M193 102c-5-7 5-11 0-17" />
        </G>
      </G>
    </>
  );
}

type WorkoutSceneProps = {
  backgroundId: string;
  clipId: string;
  glowId: string;
  shouldAnimate: boolean;
};

function WorkoutScene({ backgroundId, clipId, glowId, shouldAnimate }: WorkoutSceneProps) {
  const squat = useSharedValue(0);
  const band = useSharedValue(0);
  const effortA = useSharedValue(0);
  const effortB = useSharedValue(0);
  const sweatA = useSharedValue(0);
  const sweatB = useSharedValue(0);
  const sweatC = useSharedValue(0);

  const barProps = useAnimatedProps(() => ({
    matrix: translate(0, interpolate(squat.value, [0, 1], [9, 0])),
  }));
  const bodyProps = useAnimatedProps(() => ({
    matrix: compose(
      translate(0, interpolate(squat.value, [0, 1], [14, 0])),
      scaleAbout(
        interpolate(squat.value, [0, 1], [1.05, 1]),
        interpolate(squat.value, [0, 1], [0.95, 1]),
        100,
        168
      )
    ),
  }));
  const legsProps = useAnimatedProps(() => ({
    matrix: scaleAbout(1, interpolate(squat.value, [0, 1], [0.44, 1]), 100, 188),
  }));
  const shadowProps = useAnimatedProps(() => ({
    matrix: scaleAbout(interpolate(squat.value, [0, 1], [1.07, 0.92]), 1, 170, 178),
    opacity: interpolate(squat.value, [0, 1], [0.15, 0.1]),
  }));
  const bandProps = useAnimatedProps(() => ({
    matrix: rotateAbout(interpolate(band.value, [0, 1], [-6, 10]), 62, 88),
  }));

  const useEffortProps = (
    progress: SharedValue<number>,
    originX: number,
    originY: number
  ) =>
    useAnimatedProps(() => ({
      matrix: scaleAbout(interpolate(progress.value, [0, 1], [0.75, 1]), 1, originX, originY),
      opacity: interpolate(progress.value, [0, 1], [0.12, 0.5]),
    }));

  const effortLeftProps = useEffortProps(effortA, 118, 72);
  const effortLeftLowerProps = useEffortProps(effortB, 114, 84);
  const effortRightProps = useEffortProps(effortA, 222, 72);
  const effortRightLowerProps = useEffortProps(effortB, 226, 84);

  const useSweatProps = (
    progress: SharedValue<number>,
    cx: number,
    cy: number,
    xDirection: number
  ) =>
    useAnimatedProps(() => {
      const x = interpolate(progress.value, [0, 0.3, 0.45, 1], [0, 0, 4 * xDirection, 15 * xDirection]);
      const y = interpolate(progress.value, [0, 0.3, 0.45, 1], [0, 0, -5, -17]);
      const scale = interpolate(progress.value, [0, 0.3, 0.45, 1], [0.4, 0.4, 1, 0.9]);
      return {
        matrix: compose(translate(x, y), scaleAbout(scale, scale, cx, cy)),
        opacity: interpolate(progress.value, [0, 0.3, 0.45, 1], [0, 0, 0.95, 0]),
      };
    });

  const sweatAProps = useSweatProps(sweatA, 128, 100, -1);
  const sweatBProps = useSweatProps(sweatB, 214, 96, 1);
  const sweatCProps = useSweatProps(sweatC, 212, 112, 1);

  // Audit: This effect keeps the bar, body, legs, shadow, effort and sweat on one repeatable workout cadence.
  React.useEffect(() => {
    const values = [squat, band, effortA, effortB, sweatA, sweatB, sweatC];
    values.forEach((value) => {
      cancelAnimation(value);
      value.value = 0;
    });

    if (!shouldAnimate) return;

    squat.value = withRepeat(
      withSequence(
        withDelay(
          150,
          withTiming(1, { duration: 525, easing: Easing.inOut(Easing.ease) })
        ),
        withDelay(
          225,
          withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) })
        )
      ),
      -1,
      false
    );
    band.value = withRepeat(
      withTiming(1, { duration: 375, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    effortA.value = withRepeat(
      withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    effortB.value = withDelay(
      120,
      withRepeat(
        withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
    startLoop(sweatA, 1500, 0, Easing.out(Easing.ease));
    startLoop(sweatB, 1500, 180, Easing.out(Easing.ease));
    startLoop(sweatC, 1500, 420, Easing.out(Easing.ease));

    return () => values.forEach(cancelAnimation);
  }, [band, effortA, effortB, shouldAnimate, squat, sweatA, sweatB, sweatC]);

  return (
    <>
      <Defs>
        <LinearGradient id={backgroundId} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#E4EFFF" />
          <Stop offset="1" stopColor="#F8FBFF" />
        </LinearGradient>
        <RadialGradient id={glowId}>
          <Stop offset="0" stopColor="#FF9500" stopOpacity={0.3} />
          <Stop offset="1" stopColor="#FF9500" stopOpacity={0} />
        </RadialGradient>
        <ClipPath id={clipId}>
          <Rect height={200} width={340} />
        </ClipPath>
      </Defs>
      <G clipPath={'url(#' + clipId + ')'}>
        <Rect fill={'url(#' + backgroundId + ')'} height={200} width={340} />
        <Circle cx={170} cy={118} fill={'url(#' + glowId + ')'} r={100} />
        <Rect fill={palette.eye} height={15} opacity={0.07} rx={7.5} width={280} x={30} y={170} />
        <G>
          <Rect fill={palette.eye} height={22} opacity={0.82} rx={3.5} width={9} x={40} y={152} />
          <Rect fill="#64748B" height={7} rx={3.5} width={20} x={48} y={159} />
          <Rect fill={palette.eye} height={22} opacity={0.82} rx={3.5} width={9} x={67} y={152} />
        </G>
        <G>
          <Path d="M252 158a10 10 0 0 1 20 0" fill="none" stroke="#475569" strokeLinecap="round" strokeWidth={4.5} />
          <Circle cx={262} cy={164} fill={palette.eye} opacity={0.82} r={11} />
          <Ellipse cx={262} cy={161} fill="#64748B" rx={5.5} ry={2.6} />
        </G>
        <Rect fill="#BFDBFE" height={28} opacity={0.9} rx={7} stroke="#93C5FD" strokeWidth={1.5} width={16} x={292} y={146} />
        <Rect fill={palette.body} height={8} rx={2.8} width={8} x={296} y={139} />
        <G fill="none" stroke={palette.accent} strokeLinecap="round" strokeWidth={3.5}>
          <AnimatedPath animatedProps={effortLeftProps as never} d="M118 72h-15" />
          <AnimatedPath animatedProps={effortLeftLowerProps as never} d="M114 84H95" />
          <AnimatedPath animatedProps={effortRightProps as never} d="M222 72h15" />
          <AnimatedPath animatedProps={effortRightLowerProps as never} d="M226 84h19" />
        </G>
        <AnimatedEllipse animatedProps={shadowProps as never} cx={170} cy={178} fill={palette.eye} rx={45} ry={6.5} />
        <AnimatedG animatedProps={barProps as never} transform="translate(0 9)">
          <Path d="M46 100q124 4 248 0" fill="none" stroke="#94A3B8" strokeLinecap="round" strokeWidth={7} />
          <Path d="M46 98q124 4 248 0" fill="none" opacity={0.85} stroke="#CBD5E1" strokeLinecap="round" strokeWidth={2.2} />
          <Rect fill={palette.eye} height={52} rx={5} width={12} x={54} y={74} transform="rotate(-3 60 100)" />
          <Rect fill={palette.eye} height={64} rx={6} width={15} x={70} y={68} />
          <Rect fill={palette.body} height={36} opacity={0.45} rx={3} width={6} x={74.5} y={82} />
          <Rect fill="#64748B" height={22} rx={3} width={6} x={87} y={89} />
          <Rect fill={palette.eye} height={52} rx={5} width={12} x={274} y={74} transform="rotate(3 280 100)" />
          <Rect fill={palette.eye} height={64} rx={6} width={15} x={255} y={68} />
          <Rect fill={palette.body} height={36} opacity={0.45} rx={3} width={6} x={259.5} y={82} />
          <Rect fill="#64748B" height={22} rx={3} width={6} x={247} y={89} />
        </AnimatedG>
        <G transform="translate(108 62) scale(0.62)">
          <G fill="none" stroke={palette.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth={5}>
            <Path d="M72 186l12-9 12 9M84 177v11M104 186l12-9 12 9M116 177v11" />
          </G>
          <AnimatedG animatedProps={legsProps as never} transform="scale(1 0.44)">
            <G fill="none" stroke={palette.accent} strokeLinecap="round" strokeWidth={5.5}>
              <Path d="M86 150q-10 16-1 27M114 150q10 16 1 27" />
            </G>
          </AnimatedG>
          <AnimatedG animatedProps={bodyProps as never} transform="translate(0 14) scale(1.05 0.95)">
            <G transform="translate(0 -14)">
              <Ellipse cx={48} cy={71} fill={palette.wing} rx={12.5} ry={23} transform="rotate(-44 48 94)" />
              <Ellipse cx={152} cy={71} fill={palette.wing} rx={12.5} ry={23} transform="rotate(44 152 94)" />
              <G fill={palette.body} transform="rotate(48 103 58)">
                <Path d="M99 58C95 42 91 34 88 25C97 31 102 41 104 54ZM104 56C107 41 111 33 118 26C118 37 113 48 109 58Z" />
              </G>
              <Ellipse cx={100} cy={112} fill={palette.body} rx={58} ry={56} />
              <Ellipse cx={100} cy={132} fill={palette.belly} rx={36} ry={32} />
              <Ellipse cx={60} cy={128} fill={palette.cheek} opacity={0.62} rx={11} ry={7} />
              <Ellipse cx={140} cy={128} fill={palette.cheek} opacity={0.62} rx={11} ry={7} />
              <Circle cx={80} cy={106} fill="#FFFFFF" r={15} />
              <Circle cx={120} cy={106} fill="#FFFFFF" r={15} />
              <Circle cx={82} cy={108} fill={palette.eye} r={8} />
              <Circle cx={118} cy={108} fill={palette.eye} r={8} />
              <Circle cx={78.5} cy={104.5} fill="#FFFFFF" r={3} />
              <Circle cx={114.5} cy={104.5} fill="#FFFFFF" r={3} />
              <Path d="M65 102a15 15 0 0 1 30 0Z" fill={palette.body} transform="rotate(13 80 106)" />
              <Path d="M105 102a15 15 0 0 1 30 0Z" fill={palette.body} transform="rotate(-13 120 106)" />
              <Path d="M87 131q13 18 26 0Z" fill={palette.accentDark} />
              <Path d="M89 131q11 10 22 0Z" fill="#7A2E00" />
              <Path d="M100 120l-12 10h24Z" fill={palette.accent} transform="rotate(-13 100 120)" />
              <Path d="M60 84q40-34 80 0" fill="none" stroke={palette.accent} strokeLinecap="round" strokeWidth={13} />
              <Path d="M62 86q38-31 76 0" fill="none" opacity={0.35} stroke="#FFFFFF" strokeLinecap="round" strokeWidth={2.6} />
              <AnimatedG animatedProps={bandProps as never} transform="rotate(-6 62 88)">
                <Path d="M62 88l-16 8M62 91l-14 13" fill="none" stroke={palette.accent} strokeLinecap="round" strokeWidth={5.5} />
              </AnimatedG>
            </G>
          </AnimatedG>
        </G>
        <G fill={palette.sweat}>
          <AnimatedPath animatedProps={sweatAProps as never} d="M128 92s4.6 5.6 4.6 8.4a4.6 4.6 0 0 1-9.2 0c0-2.8 4.6-8.4 4.6-8.4Z" />
          <AnimatedPath animatedProps={sweatBProps as never} d="M214 88s4.2 5.2 4.2 7.8a4.2 4.2 0 0 1-8.4 0c0-2.6 4.2-7.8 4.2-7.8Z" />
          <AnimatedPath animatedProps={sweatCProps as never} d="M212 106s3.6 4.4 3.6 6.6a3.6 3.6 0 0 1-7.2 0c0-2.2 3.6-6.6 3.6-6.6Z" opacity={0.8} />
        </G>
      </G>
    </>
  );
}

export default function PipMenuScene({
  accessibilityLabel,
  animated = true,
  scene,
  style,
}: PipMenuSceneProps) {
  const reduceMotion = useSystemReduceMotion();
  const shouldAnimate = animated && !reduceMotion;
  const idPrefix = React.useId().replace(/:/g, '');
  const backgroundId = idPrefix + '-' + scene + '-background';
  const glowId = idPrefix + '-' + scene + '-glow';
  const clipId = idPrefix + '-' + scene + '-clip';

  // Audit: The fixed aspect-ratio wrapper keeps both reference scenes responsive without distorting their 340x200 canvas.
  return (
    <View style={[{ aspectRatio: 340 / 200, width: '100%' }, style]}>
      <Svg
        accessibilityLabel={
          accessibilityLabel ??
          (scene === 'cooking'
            ? 'Pip cooking a healthy meal'
            : 'Pip performing a barbell squat')
        }
        accessibilityRole="image"
        height="100%"
        viewBox="0 0 340 200"
        width="100%"
      >
        {scene === 'cooking' ? (
          <CookingScene
            backgroundId={backgroundId}
            clipId={clipId}
            glowId={glowId}
            shouldAnimate={shouldAnimate}
          />
        ) : (
          <WorkoutScene
            backgroundId={backgroundId}
            clipId={clipId}
            glowId={glowId}
            shouldAnimate={shouldAnimate}
          />
        )}
      </Svg>
    </View>
  );
}
