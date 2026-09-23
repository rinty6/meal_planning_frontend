/**
 * "We don't know this one yet" (Design C, screens N1–N2): the label report.
 *
 * A miss is a SUCCESSFUL answer, not a failure, so this sheet is what a
 * `found: false` looks like. It never carries failure copy (ERROR_LOG 063/065),
 * and the tone is an invitation rather than an apology: the user is about to
 * do us a favour and log their own food at the same time.
 *
 * Same shape as BarcodeEditForm on the found path, with the sad rig instead of
 * the happy one, so the two read as one family. The difference is meaning: the
 * numbers typed here go to us as well as into their log.
 *
 * Three exits, in the order asked for on 2026-09-22: send and log, scan a
 * different pack, leave. No ✕, because Cancel already is one.
 *
 * Send is disabled until product name, serving size and energy carry a value
 * (checklist b0-08). Everything else is optional, including the photo: an
 * incomplete report we can verify beats no report, but an empty one is worse
 * than nothing because it tells us a barcode exists and nothing else.
 */

import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { BarcodeReportForm } from '../../api/barcode/barcodeApi.types';
import { missingReportFields } from '../../api/barcode/barcodeApi.mappers';
import PipBird from '../pip/PipBird';
import { useSheetBottomPadding } from './sheetLayout';

/** Where the optional panel photo has got to. `failed` never blocks Send. */
export type PanelPhotoState =
  | { status: 'idle' }
  | { status: 'uploading'; localUri: string }
  | { status: 'ready'; localUri: string }
  | { status: 'failed' };

type Props = {
  form: BarcodeReportForm;
  barcode: string;
  photo: PanelPhotoState;
  onChange: (patch: Partial<BarcodeReportForm>) => void;
  onTakePhoto: () => void;
  onPickPhoto: () => void;
  onRemovePhoto: () => void;
  onSend: () => void;
  onScanAgain: () => void;
  onCancel: () => void;
  disabled?: boolean;
};

type FieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  unit?: React.ReactNode;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
  flex?: number;
  editable: boolean;
  /** Starred fields get a red dot while empty, so "why is Send grey" answers itself. */
  missing?: boolean;
};

const Field = ({
  label,
  value,
  placeholder,
  unit,
  onChangeText,
  keyboardType = 'default',
  flex = 1,
  editable,
  missing = false,
}: FieldProps) => (
  <View style={{ flex }}>
    <Text className="text-[10.5px] font-bold mb-1" style={{ color: missing ? '#B45309' : '#6B7280' }}>
      {label}
    </Text>
    <View
      className="flex-row items-center rounded-xl px-3"
      style={{
        backgroundColor: '#EEF2F6',
        minHeight: 38,
        borderWidth: missing ? 1 : 0,
        borderColor: '#FCD9A6',
      }}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        placeholder={placeholder}
        accessibilityLabel={label}
        className="flex-1 text-[13px]"
        style={{ color: '#0B2149', paddingVertical: 8 }}
        placeholderTextColor="#9AA3B2"
      />
      {unit}
    </View>
  </View>
);

/** g or ml. The report table constrains the unit, so it cannot be free text. */
const UnitToggle = ({
  unit,
  onChange,
  disabled,
}: {
  unit: 'g' | 'ml';
  onChange: (unit: 'g' | 'ml') => void;
  disabled: boolean;
}) => (
  <TouchableOpacity
    onPress={() => onChange(unit === 'g' ? 'ml' : 'g')}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={`Serving unit ${unit}, tap to switch`}
    className="rounded-lg px-2 py-0.5 ml-1"
    style={{ backgroundColor: '#DCE6F2' }}
  >
    <Text className="text-[11px] font-bold" style={{ color: '#41608C' }}>{unit} ⇄</Text>
  </TouchableOpacity>
);

const Unit = ({ text }: { text: string }) => (
  <Text className="text-[11px] ml-1" style={{ color: '#9AA3B2' }}>{text}</Text>
);

const PhotoSlot = ({
  photo,
  onTakePhoto,
  onPickPhoto,
  onRemovePhoto,
  disabled,
}: Pick<Props, 'photo' | 'onTakePhoto' | 'onPickPhoto' | 'onRemovePhoto'> & { disabled: boolean }) => {
  const attached = photo.status === 'ready' || photo.status === 'uploading';

  return (
    <View
      className="flex-row items-center rounded-2xl p-2.5 mb-2.5"
      style={{ borderWidth: 1, borderColor: attached ? '#BBE3C9' : '#DAE2EC', backgroundColor: attached ? '#F3FBF5' : '#FFFFFF' }}
    >
      <TouchableOpacity
        onPress={onTakePhoto}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={attached ? 'Replace the nutrition panel photo' : 'Take a photo of the nutrition panel'}
        className="flex-row items-center flex-1"
      >
        {attached ? (
          <Image
            source={{ uri: (photo as { localUri: string }).localUri }}
            style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: '#EEF2F6' }}
          />
        ) : (
          <View className="items-center justify-center rounded-lg" style={{ width: 38, height: 38, backgroundColor: '#EEF2F6' }}>
            <Ionicons name="camera-outline" size={19} color="#5B6676" />
          </View>
        )}

        <View className="flex-1 ml-2.5">
          <Text className="text-[12.5px] font-bold" style={{ color: '#0B2149' }}>
            {photo.status === 'uploading'
              ? 'Attaching the panel…'
              : photo.status === 'ready'
                ? 'Nutrition panel attached'
                : photo.status === 'failed'
                  ? 'That photo did not attach'
                  : 'Photo of the nutrition panel'}
          </Text>
          <Text className="text-[11px] mt-0.5" style={{ color: photo.status === 'failed' ? '#B45309' : '#8A93A3' }}>
            {photo.status === 'ready'
              ? 'Tap to replace'
              : photo.status === 'failed'
                ? 'You can send without it, or tap to try again.'
                : 'Optional, but it lets us verify the numbers'}
          </Text>
        </View>
      </TouchableOpacity>

      {photo.status === 'ready' ? (
        <TouchableOpacity
          onPress={onRemovePhoto}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Remove the photo"
          className="rounded-full items-center justify-center ml-1"
          style={{ width: 28, height: 28, backgroundColor: '#E6F4EA' }}
        >
          <Ionicons name="close" size={15} color="#3F7D55" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onPickPhoto}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Choose a photo from the library"
          className="rounded-full items-center justify-center ml-1"
          style={{ width: 28, height: 28, backgroundColor: '#EEF2F6' }}
        >
          <Ionicons name="images-outline" size={15} color="#5B6676" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const BarcodeReportSheet = ({
  form,
  barcode,
  photo,
  onChange,
  onTakePhoto,
  onPickPhoto,
  onRemovePhoto,
  onSend,
  onScanAgain,
  onCancel,
  disabled = false,
}: Props) => {
  const paddingBottom = useSheetBottomPadding();
  const missing = missingReportFields(form);
  const sendable = missing.length === 0;
  // The photo is optional, so uploading it does not gate Send. It does gate
  // this one tap, because sending mid-upload would drop the attachment.
  const sending = disabled || photo.status === 'uploading';

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <View className="rounded-t-3xl px-4 pt-2.5" style={{ backgroundColor: '#FFFFFF', maxHeight: '94%', paddingBottom }}>
          <View className="self-center rounded-full mb-2" style={{ width: 40, height: 5, backgroundColor: '#E3E8EF' }} />

          <View className="flex-row items-center mb-1.5">
            <PipBird state="sad" size={52} />
            <View className="flex-1 ml-2">
              <Text className="text-[16px] font-extrabold" style={{ color: '#0B2149' }}>
                We don’t know this one yet
              </Text>
              <Text className="text-[11.5px]" style={{ color: '#6B7280' }}>Barcode {barcode}</Text>
            </View>
          </View>

          <Text className="text-[12.5px] mb-2.5" style={{ color: '#475569' }}>
            Tell us what’s on the label. We’ll check it and add the product to the catalogue for everyone.
          </Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            <PhotoSlot
              photo={photo}
              onTakePhoto={onTakePhoto}
              onPickPhoto={onPickPhoto}
              onRemovePhoto={onRemovePhoto}
              disabled={disabled}
            />

            <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: '#E3E8EF' }}>
              <View className="mb-1.5">
                <Field
                  label="Product name *"
                  value={form.productName}
                  placeholder="e.g. Rice Crackers"
                  editable={!disabled}
                  missing={missing.includes('productName')}
                  onChangeText={(t) => onChange({ productName: t })}
                />
              </View>

              <View className="flex-row mb-1.5" style={{ gap: 8 }}>
                <Field
                  label="Brand"
                  value={form.brand}
                  placeholder="e.g. Want Want"
                  editable={!disabled}
                  onChangeText={(t) => onChange({ brand: t })}
                />
                <Field
                  label="Serving size *"
                  value={form.servingSize}
                  placeholder="30"
                  keyboardType="decimal-pad"
                  flex={0.78}
                  editable={!disabled}
                  missing={missing.includes('servingSize')}
                  onChangeText={(t) => onChange({ servingSize: t })}
                  unit={
                    <UnitToggle
                      unit={form.servingUnit}
                      disabled={disabled}
                      onChange={(servingUnit) => onChange({ servingUnit })}
                    />
                  }
                />
              </View>

              <View className="flex-row mb-1.5" style={{ gap: 8 }}>
                <Field
                  label="Energy *"
                  value={form.energyKj}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  editable={!disabled}
                  missing={missing.includes('energyKj')}
                  onChangeText={(t) => onChange({ energyKj: t })}
                  unit={<Unit text="kJ" />}
                />
                <Field
                  label="Protein"
                  value={form.proteinG}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  editable={!disabled}
                  onChangeText={(t) => onChange({ proteinG: t })}
                  unit={<Unit text="g" />}
                />
              </View>

              <View className="flex-row" style={{ gap: 8 }}>
                <Field
                  label="Carbs"
                  value={form.carbohydrateG}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  editable={!disabled}
                  onChangeText={(t) => onChange({ carbohydrateG: t })}
                  unit={<Unit text="g" />}
                />
                <Field
                  label="Fat"
                  value={form.fatG}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  editable={!disabled}
                  onChangeText={(t) => onChange({ fatG: t })}
                  unit={<Unit text="g" />}
                />
              </View>

              <Text className="text-[11px] text-center mt-2.5" style={{ color: '#9AA3B2' }}>
                As printed on the pack, per serving
              </Text>
            </View>
          </ScrollView>

          {/* Outside the scroll: with the keyboard up the sheet is capped, and
              the three ways out must stay on screen. */}
          <TouchableOpacity
            onPress={onSend}
            disabled={!sendable || sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !sendable || sending }}
            accessibilityHint={sendable ? undefined : 'Fill in product name, serving size and energy first'}
            className="rounded-2xl py-3 items-center mt-3"
            style={{ backgroundColor: !sendable || sending ? '#BFDBFE' : '#007BFF' }}
          >
            <Text className="text-white font-bold text-base">Send &amp; add to Meal Plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onScanAgain}
            disabled={disabled}
            accessibilityRole="button"
            className="rounded-2xl py-3 items-center mt-2"
            style={{ backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: disabled ? '#BFDBFE' : '#007BFF' }}
          >
            <Text className="font-bold text-base" style={{ color: disabled ? '#BFDBFE' : '#007BFF' }}>Scan again</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onCancel} disabled={disabled} accessibilityRole="button" className="py-3 items-center">
            <Text className="font-bold text-[13.5px]" style={{ color: '#9AA3B2' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default BarcodeReportSheet;
