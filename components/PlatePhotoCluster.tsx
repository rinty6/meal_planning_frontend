// Overlapping round photos for a catalogue plate (checklist m5-01).
// Fills the same square box as a single round food photo, so a plate card or
// header keeps its layout (PLANNER_PLATE_FLOW.html, section 0). Used by the
// planning card (DishCard) and the plate detail page.
//
// Draws exactly as many circles as there are photos (up to 3): a 2-food plate
// shows 2 photos, never an empty third circle with a stand-in icon (iPhone
// test, 2026-11-19). With no photo at all it shows one circle with the icon.
import React from "react";
import { View } from "react-native";
import { Image as ExpoImage } from "expo-image";

import Food3DIcon from "./Food3DIcon";

type Slot = { size: number; left?: number; right?: number; top?: number; bottom?: number; z: number };

// Positions as fractions of the box, per number of photos.
const LAYOUTS: Record<1 | 2 | 3, Slot[]> = {
  1: [{ size: 1, left: 0, top: 0, z: 1 }],
  // Two photos: big top-left, smaller bottom-right, overlapping on the diagonal.
  2: [
    { size: 0.7, left: 0, top: 0, z: 2 },
    { size: 0.6, right: 0, bottom: 0.02, z: 1 },
  ],
  // Three photos: big top-left, right, bottom-middle.
  3: [
    { size: 0.64, left: 0, top: 0, z: 3 },
    { size: 0.57, right: 0, top: 0.09, z: 2 },
    { size: 0.57, left: 0.25, bottom: 0, z: 1 },
  ],
};

type Props = { photos: string[]; title: string; size?: number };

const PlatePhotoCluster = ({ photos, title, size = 88 }: Props) => {
  const shown = photos.filter(Boolean).slice(0, 3);
  const count = Math.max(1, shown.length) as 1 | 2 | 3;
  return (
    <View style={{ width: size, height: size }}>
      {LAYOUTS[count].map((slot, index) => {
        const d = Math.round(slot.size * size);
        const uri = shown[index];
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              width: d,
              height: d,
              borderRadius: d / 2,
              left: slot.left !== undefined ? slot.left * size : undefined,
              right: slot.right !== undefined ? slot.right * size : undefined,
              top: slot.top !== undefined ? slot.top * size : undefined,
              bottom: slot.bottom !== undefined ? slot.bottom * size : undefined,
              zIndex: slot.z,
              overflow: "hidden",
              borderWidth: 3,
              borderColor: "#fff",
              backgroundColor: "#F3F4F6",
              shadowColor: "#0B2149",
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 5 },
              elevation: 4,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {uri ? (
              <ExpoImage source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" transition={120} />
            ) : (
              <Food3DIcon name={title} size={Math.round(d * 0.45)} />
            )}
          </View>
        );
      })}
    </View>
  );
};

export default PlatePhotoCluster;
