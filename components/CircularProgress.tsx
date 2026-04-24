// This component will draw the progress rings for 
// my Calories, Carbs, Protein, and Fat without slowing down the app's performance.

import React from 'react';
import { View, Text } from 'react-native';
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
    showUnit?: boolean;
    showConsumed?: boolean;
}

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
    showUnit = false,
    showConsumed = false
}) => {
    // Convert inputs safely to numbers
    const numValue = Number(value) || 0;
    const numMax = Number(maxValue) || 1;

    const circumference = 2 * Math.PI * radius;
    const safeMaxValue = numMax > 0 ? numMax : 1;
    
    // Progress capped at 1 (100%) so the circle doesn't overdraw itself
    const progress = Math.min(numValue / safeMaxValue, 1);
    const strokeDashoffset = circumference - progress * circumference;

    const size = (radius + strokeWidth) * 2;
    
    // Display logic: if showConsumed is true, display consumed amount, otherwise display remaining
    const displayValue = showConsumed ? numValue : Math.max(numMax - numValue, 0);
    
    // Determine color based on whether user exceeded calorie target
    let displayColor = color;
    if (showConsumed && label === 'Calories' && numValue > numMax) {
        displayColor = '#EF4444'; // Red color for exceeded
    }

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
                    <Circle
                        stroke={displayColor}
                        fill="none"
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        strokeWidth={strokeWidth}
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeDashoffset={strokeDashoffset}
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
        </View>
    );
};

export default CircularProgress;
