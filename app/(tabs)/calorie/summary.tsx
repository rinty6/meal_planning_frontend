import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, FlatList, Linking } from 'react-native';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import Svg, { Path, Circle } from 'react-native-svg';
import InfoButton from '../../../components/InforButton';
import CustomAlert from '../../../components/customAlert';

const ITEM_WIDTH = 48; // Width of the date box (w-12 is ~48px)
const ITEM_MARGIN = 12; // Margin right (mr-3 is ~12px)
const TOTAL_ITEM_SIZE = ITEM_WIDTH + ITEM_MARGIN;
const INSIGHTS_WINDOW_DAYS = 28;

const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describePieSlice = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
) => {
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
};

const MacroPieChart = ({ protein, carbs, fats }: { protein: number; carbs: number; fats: number }) => {
  const segments = [
    { label: 'Protein', value: Math.max(0, toNumber(protein)), color: '#8B5CF6' },
    { label: 'Carbs', value: Math.max(0, toNumber(carbs)), color: '#3B82F6' },
    { label: 'Fat', value: Math.max(0, toNumber(fats)), color: '#F59E0B' },
  ];

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const size = 120;
  const radius = size / 2;

  if (total <= 0) {
    return (
      <View className="items-center mb-6">
        <Svg width={size} height={size}>
          <Circle cx={radius} cy={radius} r={radius} fill="#E5E7EB" />
        </Svg>
      </View>
    );
  }

  const positiveSegments = segments.filter((segment) => segment.value > 0);

  if (positiveSegments.length === 1) {
    return (
      <View className="items-center mb-6">
        <Svg width={size} height={size}>
          <Circle cx={radius} cy={radius} r={radius} fill={positiveSegments[0].color} />
        </Svg>
      </View>
    );
  }

  let currentAngle = 0;
  const slices = positiveSegments.map((segment) => {
    const sweepAngle = (segment.value / total) * 360;
    const slice = {
      ...segment,
      startAngle: currentAngle,
      endAngle: currentAngle + sweepAngle,
    };
    currentAngle += sweepAngle;
    return slice;
  });

  return (
    <View className="items-center mb-6">
      <Svg width={size} height={size}>
        {slices.map((slice) => (
          <Path
            key={slice.label}
            d={describePieSlice(radius, radius, radius, slice.startAngle, slice.endAngle)}
            fill={slice.color}
          />
        ))}
      </Svg>
    </View>
  );
};

const fetchJson = async (url: string) => {
  try {
    const response = await fetch(url);
    const payload = await response.json();
    return { ok: response.ok, payload };
  } catch (error) {
    console.error(error);
    return null;
  }
};

const getConfidenceTheme = (confidence: string) => {
  if (confidence === 'high') {
    return {
      label: 'High confidence',
      backgroundColor: '#ECFDF5',
      borderColor: '#A7F3D0',
      textColor: '#047857',
    };
  }

  if (confidence === 'medium') {
    return {
      label: 'Medium confidence',
      backgroundColor: '#EFF6FF',
      borderColor: '#BFDBFE',
      textColor: '#1D4ED8',
    };
  }

  return {
    label: 'Low confidence',
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    textColor: '#4B5563',
  };
};

const getToneTheme = (tone: string) => {
  if (tone === 'positive') {
    return {
      icon: 'trending-up-outline' as const,
      backgroundColor: '#F0FDF4',
      borderColor: '#BBF7D0',
      iconColor: '#16A34A',
      titleColor: '#14532D',
    };
  }

  if (tone === 'attention') {
    return {
      icon: 'alert-circle-outline' as const,
      backgroundColor: '#FFF7ED',
      borderColor: '#FED7AA',
      iconColor: '#EA580C',
      titleColor: '#9A3412',
    };
  }

  return {
    icon: 'analytics-outline' as const,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    iconColor: '#475569',
    titleColor: '#0F172A',
  };
};

const formatMealTypeLabel = (mealType: string) => {
  const normalized = String(mealType || '').trim().toLowerCase();
  if (!normalized) return 'Meal';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const InsightPill = ({ confidence }: { confidence: string }) => {
  const theme = getConfidenceTheme(confidence);
  return (
    <View
      className="rounded-full border px-3 py-1"
      style={{ backgroundColor: theme.backgroundColor, borderColor: theme.borderColor }}
    >
      <Text style={{ color: theme.textColor }} className="text-[11px] font-semibold">
        {theme.label}
      </Text>
    </View>
  );
};

const InsightCard = ({
  title,
  summary,
  detail,
  confidence,
  tone,
  footer,
}: {
  title: string;
  summary: string;
  detail: string;
  confidence: string;
  tone: string;
  footer?: string;
}) => {
  const toneTheme = getToneTheme(tone);

  return (
    <View
      className="rounded-3xl border p-5 shadow-sm mb-4"
      style={{ backgroundColor: toneTheme.backgroundColor, borderColor: toneTheme.borderColor }}
    >
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center mb-2">
            <Ionicons name={toneTheme.icon} size={18} color={toneTheme.iconColor} />
            <Text className="font-bold text-base ml-2" style={{ color: toneTheme.titleColor }}>
              {title}
            </Text>
          </View>
          <Text className="text-gray-900 font-semibold leading-6">{summary}</Text>
        </View>
        <InsightPill confidence={confidence} />
      </View>
      <Text className="text-gray-600 leading-6">{detail}</Text>
      {!!footer && (
        <View className="mt-4 pt-4 border-t border-black/5">
          <Text className="text-xs text-gray-500 font-medium">{footer}</Text>
        </View>
      )}
    </View>
  );
};

const CalorieSummaryScreen = () => {
  const router = useRouter();
  const { userId } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [data, setData] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMacroAlert, setShowMacroAlert] = useState(false);

  // 1. Generate Dates & Find Today's Index
  const { dates, todayIndex } = useMemo(() => {
    const list = [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const numDays = new Date(year, month + 1, 0).getDate();

    let tIndex = 0;
    for (let i = 1; i <= numDays; i++) {
      const d = new Date(year, month, i);
      list.push(d);
      if (d.getDate() === today.getDate()) tIndex = i - 1;
    }
    return { dates: list, todayIndex: tIndex };
  }, []);

  const loadSummary = useCallback(async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const dateStr = formatLocalYYYYMMDD(selectedDate);

      const [dailyResult, weeklyResult, insightsResult] = await Promise.all([
        fetchJson(`${apiURL}/api/calorie/summary/${userId}/${dateStr}`),
        fetchJson(`${apiURL}/api/calorie/weekly/${userId}/${dateStr}`),
        fetchJson(`${apiURL}/api/calorie/insights/${userId}/${dateStr}?window=${INSIGHTS_WINDOW_DAYS}`),
      ]);

      if (dailyResult?.ok) setData(dailyResult.payload);
      if (weeklyResult?.ok) setWeeklyData(weeklyResult.payload);
      if (insightsResult?.ok) {
        setInsights(insightsResult.payload);
      } else {
        setInsights(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedDate, userId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleMacroInfoPress = () => {
    setShowMacroAlert(true);
  };

  const handleOpenLink = () => {
    Linking.openURL('https://greenreliefmd.com/tdee-calculator/').catch(() => {
      console.error('Failed to open URL');
    });
    setShowMacroAlert(false);
  };

  const MacroBar = ({ label, value, total, color }: any) => {
    const safeValue = Math.max(0, toNumber(value));
    const safeTotal = Math.max(0, toNumber(total));
    const normalizedTotal = safeTotal > 0 ? safeTotal : 1;
    const width = Math.min(100, (safeValue / normalizedTotal) * 100);

    return (
      <View className="mb-3">
        <View className="flex-row justify-between mb-1">
          <Text className="text-gray-600 font-medium text-xs">{label}</Text>
          <Text className="text-gray-900 font-bold text-xs">
            {Math.round(safeValue)} / {Math.round(safeTotal)}g
          </Text>
        </View>
        <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <View style={{ width: `${width}%`, backgroundColor: color }} className="h-full rounded-full" />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER */}
      <View className="px-5 py-4 flex-row items-center relative justify-between">
        <TouchableOpacity onPress={() => router.push('/(tabs)/calorie')} className="z-10 p-2 bg-gray-50 rounded-full">
          <Ionicons name="chevron-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-lg font-bold">Daily Summary</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/calorie/goalSetting')} className="p-2">
          <Ionicons name="settings-outline" size={24} color="black" />
        </TouchableOpacity>
      </View>

      {/* CALENDAR STRIP (FIXED SCROLL) */}
      <View className="py-2 mb-2">
        <FlatList
          ref={flatListRef}
          horizontal
          data={dates}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.toISOString()}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          // LAYOUT CALCULATION FOR PRECISE SCROLL
          getItemLayout={(listData, index) => ({
            length: TOTAL_ITEM_SIZE,
            offset: TOTAL_ITEM_SIZE * index,
            index,
          })}
          initialScrollIndex={Math.max(0, todayIndex - 2)} // Centers Today
          renderItem={({ item }) => {
            const isSelected = formatLocalYYYYMMDD(item) === formatLocalYYYYMMDD(selectedDate);
            return (
              <TouchableOpacity
                onPress={() => setSelectedDate(item)}
                style={{ backgroundColor: isSelected ? '#007BFF' : 'transparent' }}
                className={`items-center justify-center w-12 h-16 rounded-xl mr-3 ${isSelected ? '' : 'bg-gray-50 border border-gray-100'}`}
              >
                <Text className={`text-xs mb-1 ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                  {item.toLocaleDateString('en-US', { weekday: 'short' })}
                </Text>
                <Text className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-gray-800'}`}>{item.getDate()}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <ScrollView className="px-5" showsVerticalScrollIndicator={false}>
        {!data ? (
          <ActivityIndicator size="large" color="#007BFF" className="mt-10" />
        ) : (
          <View className={isRefreshing ? 'opacity-50' : 'opacity-100'}>
            {(() => {
              const goalCalories = Math.max(1, toNumber(data?.goal?.dailyCalories || data?.target?.dailyCalories || 2000));
              const consumedCalories = Math.max(0, toNumber(data?.consumed?.calories));
              const isOverTarget = Boolean(data?.isOverTarget) || consumedCalories > goalCalories;
              const remaining = Math.max(0, Math.round(toNumber(data?.remaining) || (goalCalories - consumedCalories)));
              const exhausted = Math.max(0, Math.round(toNumber(data?.exhausted) || (consumedCalories - goalCalories)));
              const calorieBarPercent = Math.min(100, (consumedCalories / goalCalories) * 100);
              const proteinTarget = Math.max(0, toNumber(data?.target?.protein) || Math.round((goalCalories * 0.3) / 4));
              const carbTarget = Math.max(0, toNumber(data?.target?.carbs) || Math.round((goalCalories * 0.4) / 4));
              const fatTarget = Math.max(0, toNumber(data?.target?.fats) || Math.round((goalCalories * 0.3) / 9));
              const foodSignal = insights?.foodPattern?.signals?.[0];
              const topFoodsFooter =
                insights?.foodPattern?.topFoods?.length > 0
                  ? `Top foods: ${insights.foodPattern.topFoods
                      .map((food: any) => `${food.name} (${food.count}x)`)
                      .join(', ')}`
                  : 'Top foods will appear once more meals are logged.';
              const adherenceFooter =
                insights?.adherence?.loggedDays > 0
                  ? `${insights.adherence.daysOnTarget} on-target days, ${insights.adherence.daysOverTarget} over, ${insights.adherence.daysUnderTarget} under`
                  : 'We need more logged days before adherence becomes reliable.';
              const weekdayFooter =
                insights?.weekdayPattern?.topWeekday && insights?.weekdayPattern?.lowestWeekday
                  ? `Highest average: ${insights.weekdayPattern.topWeekday.day} | Lowest average: ${insights.weekdayPattern.lowestWeekday.day}`
                  : `We compare weekday averages across your last ${INSIGHTS_WINDOW_DAYS} days.`;
              const mealPatternFooter =
                insights?.mealPattern?.peakMealType
                  ? `Peak slot: ${formatMealTypeLabel(insights.mealPattern.peakMealType.mealType)}`
                  : 'Meal-slot trends use breakfast, lunch, and dinner totals.';
              const coverageSummary =
                insights?.coverage?.summary || `Insights use your recent ${INSIGHTS_WINDOW_DAYS}-day meal history when enough logs are available.`;

              return (
                <>
                  {/* 1. MAIN CALORIE RING */}
                  <View className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm mb-6">
                    <Text className="text-center text-gray-500 font-bold mb-4 uppercase tracking-widest">Calories</Text>
                    <View className="flex-row justify-between items-end mb-2">
                      <View>
                        <Text className="text-gray-400 text-xs font-bold mb-1">EATEN</Text>
                        <Text className="text-3xl font-extrabold text-blue-500">{data.consumed.calories}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-gray-400 text-xs font-bold mb-1">{isOverTarget ? 'EXHAUSTED' : 'REMAINING'}</Text>
                        <Text className={`text-3xl font-extrabold ${isOverTarget ? 'text-red-500' : 'text-gray-800'}`}>
                          {isOverTarget ? exhausted : remaining}
                        </Text>
                      </View>
                    </View>
                    <View className="h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <View
                        style={{
                          width: `${calorieBarPercent}%`,
                          backgroundColor: isOverTarget ? '#EF4444' : '#3B82F6',
                        }}
                        className="h-full rounded-full"
                      />
                    </View>
                  </View>

                  {/* 2. WEEKLY BAR CHART */}
                  <View className="mb-8">
                    <Text className="text-lg font-bold mb-4 text-gray-800">Weekly Calorie Intake</Text>
                    <View className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex-row justify-between items-end h-52">
                      {weeklyData.map((day, index) => {
                        const isSelected = day.date === formatLocalYYYYMMDD(selectedDate);
                        const dayCalories = Math.round(toNumber(day.calories));
                        const goal = goalCalories || 2000;
                        const percentage = Math.min(100, (dayCalories / Math.max(goal * 1.2, 1)) * 100);
                        const isOverDayTarget = dayCalories > goal;
                        const barColor = isOverDayTarget ? '#EF4444' : isSelected ? '#3B82F6' : '#93C5FD';

                        return (
                          <TouchableOpacity
                            key={index}
                            onPress={() => setSelectedDate(new Date(day.date))}
                            className="items-center flex-1"
                          >
                            <Text className={`text-[10px] mb-2 ${isOverDayTarget ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                              {dayCalories}
                            </Text>
                            <View className="w-2 bg-gray-100 h-32 rounded-full justify-end overflow-hidden">
                              <View style={{ height: `${percentage}%`, backgroundColor: barColor }} className="w-full rounded-full" />
                            </View>
                            <Text className={`text-xs mt-2 ${isSelected ? 'font-bold text-blue-500' : 'text-gray-400'}`}>{day.day}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  


                   {/* 4. MACROS */}
                  <View className="flex-row items-center mb-4">
                    <Text className="text-lg font-bold text-gray-800">Macronutrients</Text>
                    <InfoButton onPress={handleMacroInfoPress} />
                  </View>
                  <View className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm mb-8">
                    <MacroPieChart
                      protein={toNumber(data?.consumed?.protein)}
                      carbs={toNumber(data?.consumed?.carbs)}
                      fats={toNumber(data?.consumed?.fats)}
                    />
                    <View className="flex-row justify-between">
                      <View className="flex-1 mr-2">
                        <MacroBar label="Protein" value={data.consumed.protein} total={proteinTarget} color="#8B5CF6" />
                      </View>
                      <View className="flex-1 mr-2">
                        <MacroBar label="Carbs" value={data.consumed.carbs} total={carbTarget} color="#3B82F6" />
                      </View>
                      <View className="flex-1">
                        <MacroBar label="Fat" value={data.consumed.fats} total={fatTarget} color="#F59E0B" />
                      </View>
                    </View>
                  </View>

                  {/* 3. INSIGHTS */}
                  <View className="mb-8">
                    <View className="flex-row items-center mb-4">
                      <Text className="text-lg font-bold text-gray-800">Insights</Text>
                    </View>
                    <View className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4">
                      <Text className="text-slate-700 text-xs font-semibold">{coverageSummary}</Text>
                    </View>
                    <InsightCard
                      title="Calorie Target Adherence"
                      summary={insights?.adherence?.summary || 'We are still building enough history to compare your calories against your goal.'}
                      detail={insights?.adherence?.detail || 'Once you log more meals, this card will show how often you land within 10% of your target.'}
                      confidence={insights?.adherence?.confidence || 'low'}
                      tone={insights?.adherence?.trend || 'neutral'}
                      footer={adherenceFooter}
                    />
                    <InsightCard
                      title="Weekday Pattern"
                      summary={insights?.weekdayPattern?.summary || 'Weekday calorie trends will appear after more consistent logging.'}
                      detail={insights?.weekdayPattern?.detail || 'Weekday patterns are calculated from averages so one unusually high day does not dominate.'}
                      confidence={insights?.weekdayPattern?.confidence || 'low'}
                      tone={insights?.weekdayPattern?.trend || 'neutral'}
                      footer={weekdayFooter}
                    />
                    <InsightCard
                      title="Meal Slot Pattern"
                      summary={insights?.mealPattern?.summary || 'Meal-slot trends will appear once breakfast, lunch, or dinner logging is more consistent.'}
                      detail={insights?.mealPattern?.detail || 'This phase compares breakfast, lunch, and dinner totals instead of clock times.'}
                      confidence={insights?.mealPattern?.confidence || 'low'}
                      tone={insights?.mealPattern?.trend || 'neutral'}
                      footer={mealPatternFooter}
                    />
                    <InsightCard
                      title={foodSignal?.title || 'Food Pattern'}
                      summary={insights?.foodPattern?.summary || 'Food-pattern signals will unlock as your meal history becomes richer.'}
                      detail={insights?.foodPattern?.detail || 'These insights are pattern-based and only become stronger when more foods can be classified confidently.'}
                      confidence={insights?.foodPattern?.confidence || 'low'}
                      tone={foodSignal?.tone || 'neutral'}
                      footer={topFoodsFooter}
                    />
                  </View>
                </>
              );
            })()}
          </View>
        )}
      </ScrollView>
      <CustomAlert
        visible={showMacroAlert}
        title="Macronutrient Information"
        message="These macronutrient ratios are calculated based on your calorie target and activity level. For more information, please click the link below:\n\nhttps://greenreliefmd.com/tdee-calculator/"
        confirmText="Open Link"
        cancelText="Close"
        onConfirm={handleOpenLink}
        onCancel={() => setShowMacroAlert(false)}
      />
    </SafeAreaView>
  );
};

export default CalorieSummaryScreen;
