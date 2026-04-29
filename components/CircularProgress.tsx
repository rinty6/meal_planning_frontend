// This component will draw the progress rings for 
// my Calories, Carbs, Protein, and Fat without slowing down the app's performance.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface CircularProgressProps {
    value: number | string;
    maxValue: number | string;
    radius: number;
    strokeWidth: number;
    color: string;
    label: string;
    unit: string;
    trackColor?: string;
    valueColor?: string;
    labelColor?: string;
    percentColor?: string;
    showUnit?: boolean;
    showConsumed?: boolean;
    showPercent?: boolean;
    animated?: boolean;
    animationDuration?: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const CircularProgress: React.FC<CircularProgressProps> = ({
    value,
    maxValue,
    radius,
    strokeWidth,
    color,
    label,
    unit,
    trackColor = '#E2E8F0',
    valueColor = '#0F172A',
    labelColor = '#334155',
    percentColor,
    showUnit = false,
    showConsumed = false,
    showPercent = false,
    animated = false,
    animationDuration = 900
}) => {
    // Convert inputs safely to numbers
    const numValue = Number(value) || 0;
    const numMax = Number(maxValue) || 1;

    const circumference = 2 * Math.PI * radius;
    const safeMaxValue = numMax > 0 ? numMax : 1;
    
    // Progress is capped for the ring, while the label can still show >100%.
    const progress = Math.min(Math.max(numValue / safeMaxValue, 0), 1);
    const percentValue = Math.round((numValue / safeMaxValue) * 100);
    const strokeDashoffset = circumference - progress * circumference;
    const animatedProgress = useRef(new Animated.Value(animated ? 0 : progress)).current;

    const size = (radius + strokeWidth) * 2;
    
    // Display logic: if showConsumed is true, display consumed amount, otherwise display remaining
    const displayValue = showConsumed ? numValue : Math.max(numMax - numValue, 0);
    
    const displayColor = color;

    useEffect(() => {
        animatedProgress.stopAnimation();

        if (!animated) {
            animatedProgress.setValue(progress);
            return;
        }

        animatedProgress.setValue(0);
        Animated.timing(animatedProgress, {
            toValue: progress,
            duration: animationDuration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [animated, animatedProgress, animationDuration, progress]);

    const animatedStrokeDashoffset = animatedProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [circumference, 0],
        extrapolate: 'clamp',
    });

    return (
        <View className="items-center justify-end">
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={size} height={size}>
                    {/* Background Circle */}
                    <Circle
                        stroke={trackColor}
                        fill="none"
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={strokeWidth}
                    />
                    {/* Progress Circle */}
                    <AnimatedCircle
                        stroke={displayColor}
                        fill="none"
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeDashoffset={(animated ? animatedStrokeDashoffset : strokeDashoffset) as any}
                        strokeLinecap="round"
                        rotation="-90"
                        originX={size / 2}
                        originY={size / 2}
                    />
                </Svg>
                {/* Center Text displaying value (consumed or remaining) */}
                <View style={{ position: 'absolute', alignItems: 'center' }}>
                    <Text style={{ fontSize: radius * 0.45, color: valueColor, fontWeight: '700' }}>
                        {Math.round(displayValue)}
                    </Text>
                    {showUnit && (
                        <Text style={{ fontSize: radius * 0.26, marginTop: -2, color: '#64748B' }}>
                            {unit}
                        </Text>
                    )}
                </View>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '500', color: labelColor, marginTop: 8 }}>{label}</Text>
            {showPercent && (
                <Text style={{ fontSize: 10, fontWeight: '700', color: percentColor || displayColor, marginTop: 2 }}>
                    {percentValue}%
                </Text>
            )}
        </View>
    );
};

export default CircularProgress;
