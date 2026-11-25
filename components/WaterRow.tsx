/**
 * The day's water against the NRV fluids target (checklist m6-02,
 * WATER_TOTAL_DESIGN.html, approved 2026-11-25).
 *
 * One row, one number, one button: a drop, "1.25 L  of 2.6 L", a bar, and +.
 *   Home (H1): its own card under Calorie Summary, today only, + only.
 *   Meal Summary: under the date, follows the date strip, - and +.
 * Each + is one 250 ml glass. Drinks logged as foods (coffee, milk, juice)
 * are already in the total the server returns. The minus takes back the last
 * glass only, never a logged coffee, so it shows only when there is a glass.
 * After a +, the "of 2.6 L" label briefly becomes "+250 ml · Undo".
 * Reaching the target turns the row green with a tick; going over never warns.
 *
 * Self-contained: it loads its own data, and reloads on focus and whenever a
 * meal changes anywhere (homeStore), since a logged drink moves the total.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { addWaterGlass, fetchWaterDay, removeLastWaterGlass, removeWaterGlass, type WaterDay } from "../api/water/waterApi";
import { subscribeToHomeData } from "../services/homeStore";
import { formatLitres, isWaterTargetReached, waterProgress } from "../utils/waterFormat";

const GLASS_ML = 250;
const UNDO_MS = 4000;

const SKY = "#0EA5E9";
const GREEN = "#10B981";

type Props = {
  /** YYYY-MM-DD */
  date: string;
  /** Meal Summary shows the minus; Home does not. */
  showMinus?: boolean;
  /** Outer spacing from the screen. */
  className?: string;
};

export default function WaterRow({ date, showMinus = false, className = "" }: Props) {
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [day, setDay] = useState<WaterDay | null>(null);
  const [undoId, setUndoId] = useState<number | null>(null);
  const pendingWrites = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;

  const options = useCallback(() => ({ getToken: getTokenRef.current, clerkId: userId }), [userId]);

  const load = useCallback(async () => {
    if (!userId || pendingWrites.current > 0) return;
    const requested = date;
    const result = await fetchWaterDay(requested, options());
    if (result.ok === false || dateRef.current !== requested || pendingWrites.current > 0) return;
    setDay(result.data);
  }, [date, userId, options]);

  // A new date is a new day: drop the old numbers and any Undo first.
  useEffect(() => {
    setDay(null);
    setUndoId(null);
  }, [date]);

  // Runs on focus, and again whenever `load` changes (a new date) while focused.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => subscribeToHomeData(() => { void load(); }), [load]);

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  /** Runs one write; the server's answer replaces the optimistic numbers once no other write is in flight. */
  const write = useCallback(async (run: () => ReturnType<typeof addWaterGlass>, optimistic: (d: WaterDay) => WaterDay) => {
    const requested = dateRef.current;
    setDay((d) => (d ? optimistic(d) : d));
    pendingWrites.current += 1;
    const result = await run();
    pendingWrites.current -= 1;
    if (dateRef.current !== requested) return null;
    if (result.ok === false) {
      if (pendingWrites.current === 0) void load();
      return null;
    }
    if (pendingWrites.current === 0) setDay(result.data);
    return result.data;
  }, [load]);

  const showUndo = useCallback((id: number | null | undefined) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (!id) { setUndoId(null); return; }
    setUndoId(id);
    undoTimer.current = setTimeout(() => setUndoId(null), UNDO_MS);
  }, []);

  const onAdd = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const data = await write(
      () => addWaterGlass(dateRef.current, options()),
      (d) => ({ ...d, totalMl: d.totalMl + GLASS_ML, glassesMl: d.glassesMl + GLASS_ML }),
    );
    if (data) showUndo(data.addedId);
  }, [write, options, showUndo]);

  const onMinus = useCallback(async () => {
    showUndo(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await write(
      () => removeLastWaterGlass(dateRef.current, options()),
      (d) => ({ ...d, totalMl: Math.max(0, d.totalMl - GLASS_ML), glassesMl: Math.max(0, d.glassesMl - GLASS_ML) }),
    );
  }, [write, options, showUndo]);

  const onUndo = useCallback(async () => {
    const id = undoId;
    showUndo(null);
    if (!id) return;
    await write(
      () => removeWaterGlass(id, options()),
      (d) => ({ ...d, totalMl: Math.max(0, d.totalMl - GLASS_ML), glassesMl: Math.max(0, d.glassesMl - GLASS_ML) }),
    );
  }, [undoId, write, options, showUndo]);

  // Nothing until the first answer: an empty bar that then jumps would read as "0 L".
  if (!day || !(day.targetMl > 0)) return null;

  const reached = isWaterTargetReached(day.totalMl, day.targetMl);
  const fill = waterProgress(day.totalMl, day.targetMl);
  const canMinus = showMinus && day.glassesMl > 0;

  return (
    <View
      className={`flex-row items-center rounded-2xl border px-3 py-2.5 ${className}`}
      style={{ backgroundColor: reached ? "#F0FDF4" : "#F0F9FF", borderColor: reached ? "#BBF7D0" : "#E0F2FE" }}
      accessibilityLabel={`Water ${formatLitres(day.totalMl)} of ${formatLitres(day.targetMl)}`}
    >
      <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#E0F2FE" }}>
        <Ionicons name="water" size={18} color={SKY} />
      </View>

      <View className="flex-1 mr-2">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-base font-bold" style={{ color: "#0B2149" }}>{formatLitres(day.totalMl)}</Text>
          {undoId ? (
            <TouchableOpacity onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo the last glass">
              <Text className="text-xs font-bold" style={{ color: SKY }}>+{GLASS_ML} ml · Undo</Text>
            </TouchableOpacity>
          ) : (
            <Text className="text-xs font-semibold" style={{ color: reached ? "#15803D" : "#64748B" }}>
              {reached ? "✓ " : "of "}{formatLitres(day.targetMl)}
            </Text>
          )}
        </View>
        <View className="h-2 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: reached ? "#DCFCE7" : "#DBEAFE" }}>
          <View className="h-full rounded-full" style={{ width: `${Math.round(fill * 100)}%`, backgroundColor: reached ? GREEN : SKY }} />
        </View>
      </View>

      {canMinus ? (
        <TouchableOpacity
          onPress={onMinus}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove a glass of water"
          className="w-8 h-8 rounded-full items-center justify-center mr-2 bg-white"
          style={{ borderWidth: 1.5, borderColor: "#BAE6FD" }}
        >
          <Ionicons name="remove" size={18} color={SKY} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onAdd}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Add a glass of water"
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: SKY }}
      >
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
