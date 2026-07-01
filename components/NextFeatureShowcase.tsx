import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Animated,
    Easing,
    Modal,
    ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/**
 * A single "coming soon" feature shown in the showcase.
 * Colors are held inline (per-feature) so no Tailwind token changes are needed.
 */
export type NextFeature = {
    id: string;
    title: string;        // Card title (short)
    tagline: string;      // Card tagline (short)
    sheetTitle: string;   // Bottom-sheet title (full)
    sheetTagline: string; // Bottom-sheet tagline (full)
    icon: string;         // Ionicons name
    color: string;        // Accent color
    softBg: string;       // Soft tinted card background
    eta: string;          // ETA badge label
    points: string[];     // Bullet points shown in the sheet
};

type NextFeatureShowcaseProps = {
    features?: NextFeature[];
    title?: string;
    eyebrow?: string;
    /** Auto-scrolling marquee (true) or manual horizontal scroll (false). */
    autoScroll?: boolean;
    /** Horizontal padding of the parent container, so the row can bleed to the screen edges. */
    edgeInset?: number;
    /** Marquee drift speed in px per second. */
    speed?: number;
};

const CARD_WIDTH = 172;
const CARD_GAP = 12;

// The design's 4 upcoming features, copied verbatim from the mockup's FEAT data.
export const DEFAULT_NEXT_FEATURES: NextFeature[] = [
    {
        id: 'chat',
        title: 'AI Assistant',
        tagline: 'Chat for meals & macros',
        sheetTitle: 'AI Nutrition Assistant',
        sheetTagline: 'Chat your way to better meals.',
        icon: 'chatbubbles-outline',
        color: '#007BFF',
        softBg: '#E7F1FF',
        eta: 'In development',
        points: [
            'Ask about any recipe, ingredient, or macro',
            'Answers grounded in your own logged meals',
            'Plan meals & shopping in plain language',
        ],
    },
    {
        id: 'reco',
        title: 'Smarter Picks',
        tagline: 'Meals that fit you',
        sheetTitle: 'Smarter Recommendations',
        sheetTagline: 'Meals that actually fit you.',
        icon: 'sparkles-outline',
        color: '#FF9500',
        softBg: '#FFF2E0',
        eta: 'Next up',
        points: [
            'Learns from foods you love and skip',
            'Respects your calorie & macro goals',
            'More variety, less repetition',
        ],
    },
    {
        id: 'lang',
        title: 'Your Language',
        tagline: 'Use any language',
        sheetTitle: 'Your Language',
        sheetTagline: 'Eat healthy, in any language.',
        icon: 'language-outline',
        color: '#10B981',
        softBg: '#DFF7EF',
        eta: 'Planned',
        points: [
            'Full interface translation',
            'Translated recipes & food names',
            'Region-aware food content',
        ],
    },
    {
        id: 'fitness',
        title: 'Fitness Sync',
        tagline: 'Sync your activity',
        sheetTitle: 'Fitness Sync',
        sheetTagline: 'Nutrition that knows your activity.',
        icon: 'barbell-outline',
        color: '#7C5CE0',
        softBg: '#EFEAFB',
        eta: 'On the roadmap',
        points: [
            'Connect your favorite fitness app',
            'Activity-aware calorie targets',
            'You control exactly what syncs',
        ],
    },
];

const FeatureCard = ({
    feature,
    onPress,
}: {
    feature: NextFeature;
    onPress: (feature: NextFeature) => void;
}) => (
    <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onPress(feature)}
        style={{
            width: CARD_WIDTH,
            marginRight: CARD_GAP,
            backgroundColor: feature.softBg,
            borderRadius: 24,
            padding: 16,
        }}
    >
        <View
            style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 44,
                shadowColor: feature.color,
                shadowOpacity: 0.15,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 2,
            }}
        >
            <Ionicons name={feature.icon as any} size={23} color={feature.color} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0B2149', marginBottom: 3 }}>
                    {feature.title}
                </Text>
                <Text style={{ fontSize: 11, color: '#5B6B85', lineHeight: 15 }}>
                    {feature.tagline}
                </Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={24} color={feature.color} />
        </View>
    </TouchableOpacity>
);

const NextFeatureShowcase = ({
    features = DEFAULT_NEXT_FEATURES,
    title = 'On the Way',
    eyebrow = 'A PEEK AHEAD',
    autoScroll = true,
    edgeInset = 16,
    speed = 40,
}: NextFeatureShowcaseProps) => {
    const insets = useSafeAreaInsets();
    const [selected, setSelected] = useState<NextFeature | null>(null);
    const translateX = useRef(new Animated.Value(0)).current;

    // Width of one full set of cards; the row renders two sets back-to-back and
    // loops by exactly this distance for a seamless wrap.
    const setWidth = useMemo(
        () => features.length * (CARD_WIDTH + CARD_GAP),
        [features.length]
    );

    const runMarquee = autoScroll && features.length > 0;

    useEffect(() => {
        if (!runMarquee || setWidth <= 0) return;

        translateX.setValue(0);
        const duration = (setWidth / speed) * 1000;
        const loop = Animated.loop(
            Animated.timing(translateX, {
                toValue: -setWidth,
                duration,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        loop.start();

        return () => loop.stop();
    }, [runMarquee, setWidth, speed, translateX]);

    const openSheet = (feature: NextFeature) => setSelected(feature);
    const closeSheet = () => setSelected(null);

    return (
        <View style={{ marginHorizontal: -edgeInset, marginBottom: 24 }}>
            {/* Section header */}
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                    paddingHorizontal: edgeInset,
                }}
            >
                <Text style={{ fontSize: 21, fontWeight: '800', color: '#0B2149' }}>{title}</Text>
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: '#FF9500' }}>
                    {eyebrow}
                </Text>
            </View>

            {/* Card row: auto-scrolling marquee or manual horizontal scroll */}
            {runMarquee ? (
                <View style={{ overflow: 'hidden' }}>
                    <Animated.View
                        style={{
                            flexDirection: 'row',
                            paddingHorizontal: edgeInset,
                            transform: [{ translateX }],
                        }}
                    >
                        {[...features, ...features].map((feature, index) => (
                            <FeatureCard
                                key={`${feature.id}-${index}`}
                                feature={feature}
                                onPress={openSheet}
                            />
                        ))}
                    </Animated.View>
                </View>
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: edgeInset }}
                >
                    {features.map((feature) => (
                        <FeatureCard key={feature.id} feature={feature} onPress={openSheet} />
                    ))}
                </ScrollView>
            )}

            {/* Feature detail bottom sheet */}
            <Modal
                visible={!!selected}
                transparent
                animationType="slide"
                onRequestClose={closeSheet}
            >
                <TouchableWithoutFeedback onPress={closeSheet}>
                    <View style={{ flex: 1, backgroundColor: 'rgba(11,33,73,0.45)', justifyContent: 'flex-end' }}>
                        <TouchableWithoutFeedback>
                            <View
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    borderTopLeftRadius: 30,
                                    borderTopRightRadius: 30,
                                    paddingHorizontal: 22,
                                    paddingTop: 10,
                                    paddingBottom: 30 + insets.bottom,
                                }}
                            >
                                {/* Drag handle */}
                                <View
                                    style={{
                                        width: 40,
                                        height: 5,
                                        borderRadius: 999,
                                        backgroundColor: '#E2E8F0',
                                        alignSelf: 'center',
                                        marginBottom: 18,
                                    }}
                                />

                                {selected && (
                                    <>
                                        {/* Icon tile + ETA pill */}
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: 16,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    width: 54,
                                                    height: 54,
                                                    borderRadius: 17,
                                                    backgroundColor: selected.softBg,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                <Ionicons name={selected.icon as any} size={28} color={selected.color} />
                                            </View>
                                            <Text
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: '800',
                                                    letterSpacing: 0.5,
                                                    color: selected.color,
                                                    backgroundColor: selected.softBg,
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 6,
                                                    borderRadius: 999,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {selected.eta}
                                            </Text>
                                        </View>

                                        <Text style={{ fontSize: 22, fontWeight: '800', color: '#0B2149', marginBottom: 5 }}>
                                            {selected.sheetTitle}
                                        </Text>
                                        <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
                                            {selected.sheetTagline}
                                        </Text>

                                        {selected.points.map((point, index) => (
                                            <View
                                                key={index}
                                                style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 13 }}
                                            >
                                                <Ionicons
                                                    name="checkmark-circle"
                                                    size={21}
                                                    color={selected.color}
                                                    style={{ marginRight: 11 }}
                                                />
                                                <Text style={{ flex: 1, fontSize: 14, color: '#334155', lineHeight: 20 }}>
                                                    {point}
                                                </Text>
                                            </View>
                                        ))}

                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            onPress={closeSheet}
                                            style={{
                                                marginTop: 14,
                                                backgroundColor: '#EEF2F6',
                                                borderRadius: 16,
                                                paddingVertical: 15,
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0B2149' }}>
                                                Close
                                            </Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
};

export default NextFeatureShowcase;
