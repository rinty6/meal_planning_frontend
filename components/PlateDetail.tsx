// The detail page for a catalogue plate (checklist m5-01, step 4b).
//
// Approved design: claude_memory/database redesign/meal planning redesign/
// PLANNER_PLATE_EDIT.html (2026-11-19). The user can change each food's
// portion and serving size, remove a food (and add it back) or reset the
// plate, then log it. Nutrition shows the 7 lines of an Australian label with
// %DI, and "Show more" for the rest. Every number is recomputed on the phone
// from each food's per-100 g nutrition (utils/plateEdit.ts), so editing never
// waits on the network.
//
// Shown by comboDetail.tsx when the item is a plate; single foods and recipes
// keep the existing detail page untouched.
import React, { useMemo, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import { Image as ExpoImage } from "expo-image";

import Food3DIcon from "./Food3DIcon";
import PlatePhotoCluster from "./PlatePhotoCluster";
import { PipActionStatusCard, usePipActionStatus } from "./pip/PipActionStatusCard";
import { MEAL_TYPE_ENTRIES, type MealType } from "../constants/mealTypes";
import { addMealsBatch, sendMealPlanEvent } from "../services/planning.network";
import { MealLogRequestError, resolveMealLogOutcome, type MealLogOutcome } from "../services/mealLogOutcome";
import { markMealsSummaryDirty } from "../services/mealsSummaryStore";
import { formatEnergy } from "../utils/energy";
import {
  DI_FOOTNOTE,
  activeFoods,
  canRemove,
  gramsOf,
  initialPlate,
  isEdited,
  kcalOf,
  logRowsFor,
  nutrientsOf,
  nutritionPanel,
  plateNutrients,
  plateTitle,
  portionLabel,
  stepQuantity,
  type EditableFood,
} from "../utils/plateEdit";

const C = {
  ink: "#0B2149",
  text: "#111827",
  muted: "#6B7280",
  faint: "#9CA3AF",
  line: "#EEF0F4",
  blue: "#007BFF",
  blueSoft: "#E7F1FF",
  orange: "#C2410C",
  orangeSoft: "#FFF7ED",
  red: "#DC2626",
};

const fmtQty = (q: number) => (q === 0.5 ? "½" : Number.isInteger(q) ? String(q) : `${Math.floor(q)}½`);

type Props = { item: any; dateStr: string };

const PlateDetail = ({ item, dateStr }: Props) => {
  const router = useRouter();
  const { userId, getToken } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const pipStatus = usePipActionStatus();

  const original = useMemo(() => initialPlate(item?.items || []), [item]);
  const [foods, setFoods] = useState<EditableFood[]>(original);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [view, setView] = useState<string>("plate"); // "plate" or a food key
  const [showMore, setShowMore] = useState(false);
  const [showMealSheet, setShowMealSheet] = useState(false);

  const edited = isEdited(foods, original);
  const title = plateTitle(foods) || item?.title || "Plate";
  const totals = plateNutrients(foods);
  const totalKcal = kcalOf(totals);
  const left = activeFoods(foods);
  const viewFood = view === "plate" ? null : left.find((f) => f.key === view) || null;
  const panel = nutritionPanel(viewFood ? nutrientsOf(viewFood) : totals);
  const photos = left.map((f) => f.image).filter(Boolean).slice(0, 3);

  const update = (key: string, change: Partial<EditableFood>) =>
    setFoods((current) => current.map((f) => (f.key === key ? { ...f, ...change } : f)));

  const remove = (food: EditableFood) => {
    if (!canRemove(foods)) return;
    update(food.key, { removed: true });
    setOpenKey(null);
    if (view === food.key) setView("plate");
  };

  const reset = () => {
    setFoods(original);
    setOpenKey(null);
    setView("plate");
  };

  const saveTo = async (mealType: MealType) => {
    setShowMealSheet(false);
    const apiURL = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!userId || !apiURL) return;
    const rows = logRowsFor(foods);
    const itemLabel = title;
    await pipStatus.run({
      loading: { title: `Adding ${itemLabel}…`, message: `Saving to ${mealType}` },
      context: { itemLabel, mealType },
      task: async (): Promise<MealLogOutcome> => {
        if (rows.length === 0) throw new MealLogRequestError("Nothing on the plate to add.", 400);
        // One batch: one row per food left on the plate, as combos save today.
        const payload = await addMealsBatch(
          rows.map((row) => ({ apiURL, getToken, clerkId: userId, date: dateStr, mealType, ...row }))
        );
        markMealsSummaryDirty(userId, dateStr);
        // Fire-and-forget, never on the awaited path (Error 072).
        void sendMealPlanEvent({
          apiURL,
          clerkId: userId,
          getToken,
          eventType: "accepted",
          mealType,
          item: { ...item, title, edited },
        });
        return resolveMealLogOutcome(payload, { itemLabel, mealType });
      },
      onDismiss: (result) => {
        if (result.kind === "success") router.back();
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "left", "right"]}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center" }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color="black" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: "700", color: C.muted }}>Food detail</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header: title follows the foods that are left */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={{ fontSize: 23, fontWeight: "800", color: C.text, letterSpacing: -0.4 }}>
              {title}
              {edited ? <Text style={{ fontSize: 12, fontWeight: "800", color: C.orange }}>  Edited</Text> : null}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={pill(edited)}>
                <Ionicons name="flame" size={17} color="#FF9500" />
                <Text style={{ fontWeight: "700", marginLeft: 6, color: edited ? C.orange : C.text }}>{formatEnergy(totalKcal)}</Text>
              </View>
              <View style={pill(false)}>
                <Ionicons name="restaurant-outline" size={15} color={C.muted} />
                <Text style={{ fontWeight: "700", marginLeft: 6, color: C.text }}>
                  {left.length} food{left.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          </View>
          <PlatePhotoCluster photos={photos} title={title} size={104} />
        </View>

        {/* On this plate */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: C.ink }}>On this plate</Text>
          {edited ? (
            <TouchableOpacity onPress={reset} accessibilityRole="button">
              <Text style={{ fontSize: 13, fontWeight: "800", color: C.blue }}>Reset plate</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: C.blue }}>Tap a food to change it</Text>
          )}
        </View>

        {foods.map((food) => {
          const open = openKey === food.key && !food.removed;
          const kcal = kcalOf(nutrientsOf(food));
          return (
            <View
              key={food.key}
              style={{
                borderWidth: open ? 1.6 : 1,
                borderStyle: food.removed ? "dashed" : "solid",
                borderColor: open ? C.blue : C.line,
                backgroundColor: open ? "#F8FBFF" : food.removed ? "#F9FAFB" : "#fff",
                borderRadius: 16,
                padding: 10,
                marginBottom: 8,
              }}
            >
              <TouchableOpacity
                onPress={() => (food.removed ? undefined : setOpenKey(open ? null : food.key))}
                disabled={food.removed}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", backgroundColor: "#F3F4F6", opacity: food.removed ? 0.45 : 1, alignItems: "center", justifyContent: "center" }}>
                  {food.image ? (
                    <ExpoImage source={{ uri: food.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" />
                  ) : (
                    <Food3DIcon name={food.title} size={22} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", fontSize: 14, color: food.removed ? C.faint : C.text, textDecorationLine: food.removed ? "line-through" : "none" }}>
                    {food.title}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }} numberOfLines={1}>
                    {portionLabel(food)}
                  </Text>
                </View>
                {food.removed ? (
                  <TouchableOpacity onPress={() => update(food.key, { removed: false })} accessibilityRole="button">
                    <Text style={{ fontSize: 13, fontWeight: "800", color: C.blue }}>Add back</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#374151" }}>{formatEnergy(kcal)}</Text>
                    <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={16} color={C.faint} />
                  </>
                )}
              </TouchableOpacity>

              {open ? (
                <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5EEF9", paddingTop: 10 }}>
                  <Text style={label}>How much?</Text>
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 20 }}>
                    <TouchableOpacity
                      onPress={() => update(food.key, { quantity: stepQuantity(food.quantity, -1) })}
                      accessibilityLabel="Less"
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="remove" size={20} color={C.text} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 21, fontWeight: "800", color: C.ink, minWidth: 40, textAlign: "center" }}>{fmtQty(food.quantity)}</Text>
                    <TouchableOpacity
                      onPress={() => update(food.key, { quantity: stepQuantity(food.quantity, 1) })}
                      accessibilityLabel="More"
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" }}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ textAlign: "center", fontSize: 11.5, color: C.faint, marginTop: 4 }}>
                    = {formatEnergy(kcal)} · {Math.round(gramsOf(food))} g
                  </Text>
                  <Text style={[label, { marginTop: 10 }]}>Of which serving?</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
                    {food.options.map((option) => {
                      const on = option.grams === food.serving.grams;
                      return (
                        <TouchableOpacity
                          key={`${option.description}-${option.grams}`}
                          onPress={() => update(food.key, { serving: option })}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={{
                            borderWidth: 1.5,
                            borderColor: on ? C.blue : C.line,
                            backgroundColor: on ? C.blueSoft : "#fff",
                            borderRadius: 999,
                            paddingHorizontal: 11,
                            paddingVertical: 5,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: on ? C.blue : "#4B5563" }}>{option.description}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {canRemove(foods) ? (
                    <TouchableOpacity onPress={() => remove(food)} accessibilityRole="button" style={{ alignSelf: "center", marginTop: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: C.red }}>Remove from plate</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ textAlign: "center", fontSize: 12, color: C.faint, marginTop: 12 }}>The last food can&apos;t be removed.</Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Whose nutrition: the plate or one food */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 10 }} contentContainerStyle={{ gap: 6 }}>
          {[{ key: "plate", title: "Whole plate" }, ...left.map((f) => ({ key: f.key, title: f.title }))].map((chip) => {
            const on = (viewFood ? viewFood.key : "plate") === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                onPress={() => setView(chip.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{ borderWidth: 1.5, borderColor: on ? C.blue : "#E5E7EB", backgroundColor: on ? C.blue : "#fff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "800", color: on ? "#fff" : "#4B5563" }}>{chip.title}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Nutrition information: the Australian label's 7 lines, then Show more */}
        <View style={{ borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 12, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: C.text }}>Nutrition information</Text>
            <Text style={{ fontSize: 11.5, color: C.faint, flexShrink: 1, textAlign: "right", marginLeft: 8 }} numberOfLines={1}>
              {viewFood ? portionLabel(viewFood) : "whole plate"}
            </Text>
          </View>
          <View style={{ backgroundColor: "#E8F1FF", borderRadius: 12, padding: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <View>
              <Text style={{ fontSize: 10.5, fontWeight: "800", letterSpacing: 1, color: "#1D4ED8" }}>ENERGY</Text>
              <Text style={{ fontSize: 11.5, color: "#4B5563" }}>
                {panel.kcal !== null ? `${Math.round(panel.kcal)} Cal` : "–"}{panel.energyDi ? ` · ${panel.energyDi} DI*` : ""}
              </Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: "800", color: C.text }}>
              {panel.energyKj !== null ? `${Math.round(panel.energyKj).toLocaleString("en-AU")} kJ` : "–"}
            </Text>
          </View>
          <Row label="" value="amount" di="%DI*" header />
          {panel.summary.map((r) => (
            <Row key={r.key} label={r.label} value={r.value} di={r.di} indent={r.indent} />
          ))}
          {showMore
            ? panel.more.map((r, i) => (
                <React.Fragment key={r.key}>
                  {i === 0 || panel.more[i - 1].group !== r.group ? (
                    <Text style={{ fontSize: 10.5, fontWeight: "900", color: C.ink, letterSpacing: 0.6, marginTop: 9, marginBottom: 2 }}>{r.group}</Text>
                  ) : null}
                  <Row label={r.label} value={r.value} di={r.di} indent={r.indent} />
                </React.Fragment>
              ))
            : null}
          <TouchableOpacity
            onPress={() => setShowMore((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMore }}
            style={{ alignSelf: "center", marginTop: 8, borderWidth: 1.5, borderColor: "#BFDBFE", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "800", color: C.blue }}>{showMore ? "Show less ▴" : "Show more ▾"}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10, color: C.faint, marginTop: 8, lineHeight: 14 }}>
            {DI_FOOTNOTE} A dash (–) means the value is unknown, never zero.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowMealSheet(true)}
          disabled={pipStatus.isBusy || left.length === 0}
          accessibilityRole="button"
          style={{ backgroundColor: C.blue, borderRadius: 16, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", marginBottom: 40 }}
        >
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17, marginLeft: 8 }}>Add to meal log</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* For a plate the sheet has no servings stepper: portions were set food by food. */}
      <Modal visible={showMealSheet} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowMealSheet(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: "#fff", width: "100%", maxWidth: 320, padding: 24, borderRadius: 24, maxHeight: windowHeight * 0.9 }}>
                <ScrollView contentContainerStyle={{ alignItems: "center" }} showsVerticalScrollIndicator={false}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 4 }}>Add to meal log</Text>
                  <Text style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>
                    {title} · {left.length} food{left.length === 1 ? "" : "s"}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: C.orange, marginBottom: 16 }}>{formatEnergy(totalKcal)}</Text>
                  <Text style={{ fontSize: 14, color: C.faint, marginBottom: 14 }}>When are you eating this?</Text>
                  {MEAL_TYPE_ENTRIES.map((entry, index) => (
                    <TouchableOpacity
                      key={entry.type}
                      onPress={() => void saveTo(entry.type)}
                      accessibilityRole="button"
                      style={{
                        width: "100%",
                        backgroundColor: "#fff",
                        paddingVertical: 16,
                        paddingHorizontal: 16,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "#F3F4F6",
                        marginBottom: index === MEAL_TYPE_ENTRIES.length - 1 ? 24 : 12,
                      }}
                    >
                      <Text style={{ fontWeight: "700", color: "#374151", fontSize: 16 }}>{entry.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => setShowMealSheet(false)} accessibilityRole="button">
                    <Text style={{ color: C.faint, fontWeight: "700" }}>Cancel</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Plain view after the sheet closes; never a second native Modal (Errors 019, 055). */}
      <PipActionStatusCard {...pipStatus.cardProps} />
    </SafeAreaView>
  );
};

const label = { textAlign: "center" as const, fontSize: 11.5, color: "#9AA3B2", marginBottom: 6 };

const pill = (hot: boolean) => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  alignSelf: "flex-start" as const,
  borderWidth: 1,
  borderColor: hot ? "#FED7AA" : "#E5E7EB",
  backgroundColor: hot ? "#FFF7ED" : "#fff",
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 6,
});

const Row = ({ label: text, value, di, indent = false, header = false }: { label: string; value: string; di: string; indent?: boolean; header?: boolean }) => (
  <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, borderTopWidth: header ? 0 : 1, borderTopColor: "#F3F4F6" }}>
    <Text style={{ flex: 1, fontSize: header ? 10.5 : 13, color: header ? "#9CA3AF" : indent ? "#6B7280" : "#111827", paddingLeft: indent ? 12 : 0, fontWeight: header ? "800" : "400" }}>
      {text}
    </Text>
    <Text style={{ fontSize: header ? 10.5 : 13, fontWeight: header ? "800" : "700", color: header ? "#9CA3AF" : "#111827", textAlign: "right", minWidth: 70 }}>{value}</Text>
    <Text
      style={{
        fontSize: header ? 10.5 : 11.5,
        fontWeight: header ? "800" : "400",
        color: header ? "#9CA3AF" : "#6B7280",
        width: 44,
        textAlign: "center",
        marginLeft: 8,
        backgroundColor: !header && di ? "#F3F4F6" : "transparent",
        borderRadius: 5,
        overflow: "hidden",
      }}
    >
      {di}
    </Text>
  </View>
);

export default PlateDetail;
