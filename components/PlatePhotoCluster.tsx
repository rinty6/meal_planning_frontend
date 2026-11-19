// Three overlapping round photos for a catalogue plate (checklist m5-01).
// Fills the same square box as a single round food photo, so a plate card or
// header keeps its layout (PLANNER_PLATE_FLOW.html, section 0). Used by the
// planning card (DishCard) and the plate detail page.
import React from "react";
import { View } from "react-native";
import { Image as ExpoImage } from "expo-image";

import Food3DIcon from "./Food3DIcon";

// Positions as fractions of the box: big top-left, right, bottom-middle.
const SLOTS = [
  { size: 0.64, left: 0, top: 0, z: 3 },
  { size: 0.57, right: 0, top: 0.09, z: 2 },
  { size: 0.57, left: 0.25, bottom: 0, z: 1 },
] as const;

type Props = { photos: string[]; title: string; size?: number };

const PlatePhotoCluster = ({ photos, title, size = 88 }: Props) => (
  <View style={{ width: size, height: size }}>
    {SLOTS.map((slot, index) => {
      const d = Math.round(slot.size * size);
      return (
        <View
          key={index}
          style={{
            position: "absolute",
            width: d,
            height: d,
            borderRadius: d / 2,
            left: "left" in slot ? slot.left * size : undefined,
            right: "right" in slot ? slot.right * size : undefined,
            top: "top" in slot ? slot.top * size : undefined,
            bottom: "bottom" in slot ? slot.bottom * size : undefined,
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
          {photos[index] ? (
            <ExpoImage source={{ uri: photos[index] }} style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="disk" transition={120} />
          ) : (
            <Food3DIcon name={title} size={Math.round(d * 0.45)} />
          )}
        </View>
      );
    })}
  </View>
);

export default PlatePhotoCluster;
