import { View, Text, ScrollView, Switch, TouchableOpacity, Platform, Modal } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { authedFetch } from '../../../services/authedFetch';
import { markCalorieGoalsDirty } from '../../../services/calorieGoalsStore';
import DateTimePicker from '@react-native-community/datetimepicker'; 

import TextInputArea from '../../../components/TextInput';
import Button from '../../../components/Button';
import SuccessModal from '../../../components/sucessmodal';
import CustomAlert from '../../../components/customAlert';

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isSameLocalDay = (left: Date, right: Date) =>
  formatLocalYYYYMMDD(left) === formatLocalYYYYMMDD(right);

const GoalSettingScreen = () => {
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { goalId } = useLocalSearchParams();

  // Form State
  const [goalName, setGoalName] = useState("");
  const [dailyCalories, setDailyCalories] = useState("");
  const [description, setDescription] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // DATE STATE
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => addDays(new Date(), 30));
  
  // Picker Control
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'start' | 'end'>('start');

  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: "",
    message: "",
  });

  useEffect(() => {
    if (goalId && userId) {
        const controller = new AbortController();
        const loadGoal = async () => {
            try {
                const res = await authedFetch(`/api/calorie/detail/${goalId}`, {
                    getToken: getTokenRef.current,
                    clerkId: userId,
                    signal: controller.signal,
                });
                const data = await res.json();

                if (res.ok && !controller.signal.aborted) {
                    setGoalName(data.goalName);
                    setDailyCalories(String(data.dailyCalories));
                    setDescription(data.description || "");
                    setStartDate(new Date(data.startDate));
                    setEndDate(new Date(data.endDate));
                    setNotificationsEnabled(data.notificationsEnabled);
                }
            } catch (e) {
                if (!controller.signal.aborted) console.error(e);
            }
        };
        void loadGoal();
        return () => controller.abort();
    }
  }, [goalId, userId]);

  // HANDLE DATE CHANGE
  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false); // Close immediately on Android
    
    if (selectedDate) {
      if (pickerMode === 'start') {
        const shouldMoveEndDate = selectedDate > endDate || isSameLocalDay(startDate, endDate);
        setStartDate(selectedDate);
        // Keep new goals useful by default: notifications should not expire on
        // the same day unless the user explicitly chooses that.
        if (shouldMoveEndDate) setEndDate(addDays(selectedDate, 30));
      } else {
        setEndDate(selectedDate);
      }
    }
  };

  const openPicker = (mode: 'start' | 'end') => {
    setPickerMode(mode);
    setShowPicker(true);
  };

  const showCustomAlert = (title: string, message: string) => {
    setAlertConfig({ title, message });
    setAlertVisible(true);
  };

  const handleSubmit = async () => {
      if (!goalName.trim() || !dailyCalories.trim()) {
          showCustomAlert("Missing Fields", "Please fill in all required fields.");
          return;
      }

      setLoading(true);
      try {
          const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
          const payload = {
              clerkId: userId,
              goalName,
              dailyCalories,
              description,
              // Convert Date objects to local YYYY-MM-DD strings for DB.
              startDate: formatLocalYYYYMMDD(startDate),
              endDate: formatLocalYYYYMMDD(endDate),
              notificationsEnabled
          };

          let url = `${apiURL}/api/calorie/create`;
          let method = 'POST';

          if (goalId) {
              url = `${apiURL}/api/calorie/update/${goalId}`;
              method = 'PUT';
          }

          const res = await authedFetch(url, {
              method: method,
              getToken,
              clerkId: userId,
              body: JSON.stringify(payload)
          });

          if (res.ok) {
              markCalorieGoalsDirty(userId);
              setSuccessMsg(goalId ? "Goal updated successfully!" : "New goal created!");
              setShowSuccess(true);
          } else {
              showCustomAlert("Error", "Failed to save goal.");
          }
      } catch (e) {
          console.error(e);
          showCustomAlert("Error", "Server error occurred.");
      } finally {
          setLoading(false);
      }
  };

  const handleCloseModal = () => {
      setShowSuccess(false);
      router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
        <View className="px-5 py-4 flex-row items-center relative">
        <TouchableOpacity onPress={() => router.back()} className="z-10 p-2 bg-gray-50 rounded-full">
           <Ionicons name="chevron-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-lg font-bold">
            {goalId ? "Update Goal" : "Goal Setting"}
        </Text>
      </View>
      
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        
        <Text className="text-center text-gray-500 mb-8">Set and track your daily calorie goals</Text>
        <Text className="font-bold mb-2 ml-1">Goal Name *</Text>
        <TextInputArea placeholder="e.g. Summer Fitness Goal" value={goalName} onChangeText={setGoalName} />

        <Text className="font-bold mb-2 ml-1">Daily Calorie Target (kcal) *</Text>
        <TextInputArea placeholder="e.g. 2000" value={dailyCalories} onChangeText={setDailyCalories} keyboardType="numeric" />

        <Text className="font-bold mb-2 ml-1">Description (optional)</Text>
        <TextInputArea placeholder="Add any additional notes..." value={description} onChangeText={setDescription} />

        {/* NEW DATE PICKER UI */}
        <View className="flex-row gap-4 mb-4">
            {/* START DATE */}
            <View className="flex-1">
                <Text className="font-bold mb-2 ml-1">Start Date</Text>
                <TouchableOpacity 
                    onPress={() => openPicker('start')}
                    className="bg-gray-100 p-4 rounded-xl border border-gray-200 flex-row items-center justify-between"
                >
                    <Text className="text-gray-800">{startDate.toLocaleDateString()}</Text>
                    <Ionicons name="calendar-outline" size={20} color="gray" />
                </TouchableOpacity>
            </View>

            {/* END DATE */}
            <View className="flex-1">
                <Text className="font-bold mb-2 ml-1">End Date</Text>
                <TouchableOpacity 
                    onPress={() => openPicker('end')}
                    className="bg-gray-100 p-4 rounded-xl border border-gray-200 flex-row items-center justify-between"
                >
                    <Text className="text-gray-800">{endDate.toLocaleDateString()}</Text>
                    <Ionicons name="calendar-outline" size={20} color="gray" />
                </TouchableOpacity>
            </View>
        </View>

        {/* NATIVE PICKER COMPONENT (Hidden by default, shows when clicked) */}
        {showPicker && (
              Platform.OS === 'ios' ? (
                  <Modal transparent animationType="slide" visible={showPicker}>
                      <View className="flex-1 justify-end bg-black/50">
                          <View className="bg-white p-4 rounded-t-3xl">
                              <View className="flex-row justify-between mb-4">
                                  <Text className="font-bold text-lg">Select {pickerMode === 'start' ? "Start" : "End"} Date</Text>
                                  <TouchableOpacity onPress={() => setShowPicker(false)}>
                                      <Text className="text-primary font-bold">Done</Text>
                                  </TouchableOpacity>
                              </View>
                              
                              {/* 🟢 THE FIX IS HERE */}
                              <DateTimePicker
                                  value={pickerMode === 'start' ? startDate : endDate}
                                  mode="date"
                                  display="spinner" 
                                  onChange={onDateChange}
                                  minimumDate={pickerMode === 'end' ? startDate : undefined}
                                  
                                  // 1. Force Light Theme (works on iOS 13+)
                                  themeVariant="light" 
                                  // 2. Force Text Color (works on older iOS)
                                  textColor="black"
                                  // 3. Ensure background is transparent so it picks up the parent's white
                                  style={{ backgroundColor: 'white' }} 
                              />
                              
                          </View>
                      </View>
                  </Modal>
              ) : (
                  // Android works fine as a dialog
                  <DateTimePicker
                      value={pickerMode === 'start' ? startDate : endDate}
                      mode="date"
                      display="default"
                      onChange={onDateChange}
                      minimumDate={pickerMode === 'end' ? startDate : undefined}
                  />
              )
          )}

        <View className="bg-gray-50 p-4 rounded-xl flex-row justify-between items-center mb-8 border border-gray-100">
            <View className="flex-1 mr-4">
                <Text className="font-bold text-gray-900">Enable Notifications</Text>
                <Text className="text-gray-500 text-xs mt-1">Receive reminders to help you stay on track.</Text>
            </View>
            <Switch 
                value={notificationsEnabled} 
                onValueChange={setNotificationsEnabled} 
                trackColor={{ false: "#767577", true: "#007BFF" }}
            />
        </View>

        <Button title={loading ? "Saving..." : (goalId ? "Update Goal" : "Create Goal")} onPress={handleSubmit} disabled={loading}/>
      </ScrollView>

      <SuccessModal visible={showSuccess} message={successMsg} onClose={handleCloseModal} />
      <CustomAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={() => setAlertVisible(false)}
      />
    </SafeAreaView>
  );
};

export default GoalSettingScreen;
