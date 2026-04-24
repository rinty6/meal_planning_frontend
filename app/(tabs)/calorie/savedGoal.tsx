import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import CustomAlert from '../../../components/customAlert';

const SavedGoalScreen = () => {
    const router = useRouter();
    const { userId } = useAuth();
    const [goals, setGoals] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [goalToDelete, setGoalToDelete] = useState<number | null>(null);

    const loadGoals = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            const res = await fetch(`${apiURL}/api/calorie/list/${userId}`);
            const data = await res.json();
            if (res.ok) setGoals(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useFocusEffect(useCallback(() => { loadGoals(); }, []));

    const confirmDelete = (id: number) => {
        setGoalToDelete(id);
        setAlertVisible(true);
    };

    const handleDelete = async () => {
        if (!goalToDelete) return;
        try {
            const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
            await fetch(`${apiURL}/api/calorie/delete/${goalToDelete}`, { method: 'DELETE' });
            setGoals(prev => prev.filter(g => g.id !== goalToDelete));
        } catch (e) { console.error(e); }
        finally { setAlertVisible(false); }
    };

    // RENDER ITEM MODIFIED TO SHOW STATUS
    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            onPress={() => router.push({ pathname: '/(tabs)/calorie/goalSetting', params: { goalId: item.id } })}
            className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-sm"
        >
            <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1">
                    <Text className="text-lg font-bold text-gray-900">{item.goalName}</Text>
                    {/* DYNAMIC BADGE */}
                    <View className={`px-2 py-1 rounded-full self-start mt-1 ${item.status === 'done' ? 'bg-green-500' : 'bg-yellow-500'}`}>
                        <Text className="text-white text-[10px] font-bold uppercase tracking-wider">
                            {item.status === 'done' ? 'Done 🎉' : 'In Progress ⏳'}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity onPress={() => confirmDelete(item.id)} className="p-2">
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
            </View>

            <Text className="text-gray-500 text-sm mb-3 mt-1">{item.description || "No description provided."}</Text>

            <View className="flex-row items-center space-x-4">
                <View className="flex-row items-center bg-gray-100 px-3 py-1 rounded-lg">
                    <Ionicons name="flame" size={16} color="orange" />
                    <Text className="text-gray-700 font-bold ml-2">{item.dailyCalories} kcal/day</Text>
                </View>
            </View>

            <View className="mt-3 pt-3 border-t border-gray-100 flex-row justify-between">
                <Text className="text-xs text-gray-400">Start: {new Date(item.startDate).toLocaleDateString()}</Text>
                <Text className="text-xs text-gray-400">End: {new Date(item.endDate).toLocaleDateString()}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView className="flex-1 bg-white px-5">
            <View className='py-4 flex-row items-center relative'>
                <TouchableOpacity onPress={() => router.back()} className="z-10 p-2 bg-gray-50 rounded-full">
                    <Ionicons name="chevron-back" size={24} color="black" />
                </TouchableOpacity>
                <Text className="absolute left-0 right-0 text-center text-lg font-bold">Saved Goals</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#007BFF" className="mt-15" />
            ) : (
                <FlatList
                    data={goals}
                    keyExtractor={item => String(item.id)}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 50, flexGrow: 1 }}
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center mt-20">
                            <View className="w-24 h-24 bg-gray-50 rounded-full items-center justify-center mb-4">
                                <Ionicons name="flag-outline" size={40} color="#9CA3AF" />
                            </View>
                            <Text className="text-xl font-bold text-gray-800 mb-2">No Goals Yet</Text>
                            <Text className="text-gray-400 text-center mb-8 px-10">
                                Start tracking your progress by creating your first calorie goal.
                            </Text>

                            <TouchableOpacity
                                onPress={() => router.push('/(tabs)/calorie/goalSetting')}
                                className="bg-primary px-8 py-3 rounded-full shadow-md"
                            >
                                <Text className="text-white font-bold text-lg">+ Create New Goal</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

            <CustomAlert
                visible={alertVisible}
                title="Delete Goal"
                message="Are you sure you want to delete this goal?"
                confirmText="Delete"
                onConfirm={handleDelete}
                onCancel={() => setAlertVisible(false)}
            />
        </SafeAreaView>
    );
};

export default SavedGoalScreen;