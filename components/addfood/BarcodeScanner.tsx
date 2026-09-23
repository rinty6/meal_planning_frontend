/**
 * The live camera frame of the barcode scanner (Design C, screen 1).
 *
 * Presentational: it reports a scan and a close, and owns nothing else. The
 * stages that follow (looking up, found, report) render OVER this frame from
 * addfoodmodal.tsx, which is why the camera keeps running underneath rather
 * than being torn down and rebuilt between steps.
 *
 * The ✕ belongs to THIS screen only. Once a sheet or dialog is up it carries
 * its own way out, and a second close button behind it would do the same job
 * twice (feedback 2026-09-22).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';

/** What expo-camera hands back on a successful decode. */
export type BarcodeScanResult = { data?: string; type?: string };

type Props = {
  /** False once a code has been read, so the camera stops firing while a lookup runs. */
  active: boolean;
  onScanned: (result: BarcodeScanResult) => void;
  onClose: () => void;
  /** Hidden while a sheet or dialog is showing: that surface owns the exit. */
  showClose: boolean;
};

// EAN-13 covers every Australian supermarket pack; the rest are here because
// the old scanner accepted them and removing formats is not this change's job.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_e', 'upc_a', 'code128', 'code39'] as const;

const BarcodeScanner = ({ active, onScanned, onClose, showClose }: Props) => (
  <View className="flex-1">
    <CameraView
      style={{ flex: 1 }}
      onBarcodeScanned={active ? onScanned : undefined}
      barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
    />

    {/* Aiming guide. pointer-events off so it can never eat a tap meant for
        the camera or for a sheet rendered above this component. */}
    <View className="justify-center items-center" style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={{
          width: 240,
          height: 160,
          borderWidth: 2,
          borderColor: '#007BFF',
          borderRadius: 14,
          backgroundColor: 'transparent',
        }}
      />
      <Text className="text-white text-center mt-8 text-base font-semibold">
        Align the barcode inside the frame
      </Text>
      <View className="absolute bottom-12 px-4 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
        <Text className="text-xs" style={{ color: '#EEF2F6' }}>EAN · UPC · Code 128</Text>
      </View>
    </View>

    {showClose && (
      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the scanner"
        className="absolute rounded-full items-center justify-center"
        style={{ top: 52, left: 20, width: 44, height: 44, backgroundColor: '#007BFF' }}
      >
        <Ionicons name="close" size={24} color="white" />
      </TouchableOpacity>
    )}
  </View>
);

export default BarcodeScanner;
