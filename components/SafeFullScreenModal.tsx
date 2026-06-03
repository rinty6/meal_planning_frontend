import React, { type ReactNode } from 'react';
import { Modal, Platform, StatusBar as NativeStatusBar, StyleSheet, View, type ModalProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type SafeFullScreenModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  animationType?: ModalProps['animationType'];
  backgroundColor?: string;
  statusBarStyle?: 'auto' | 'inverted' | 'light' | 'dark';
};

const IOS_TOP_FALLBACK = 44;
const IOS_BOTTOM_FALLBACK = 20;
const ANDROID_TOP_FALLBACK = NativeStatusBar.currentHeight || 24;

const SafeFullScreenModal = ({
  visible,
  onRequestClose,
  children,
  animationType = 'slide',
  backgroundColor = '#FFFFFF',
  statusBarStyle = 'dark',
}: SafeFullScreenModalProps) => {
  const insets = useSafeAreaInsets();

  // Native Modal can briefly report zero safe-area insets on first open, which caused Error 017.
  const topInset = insets.top > 0
    ? insets.top
    : Platform.OS === 'ios'
      ? IOS_TOP_FALLBACK
      : ANDROID_TOP_FALLBACK;

  // Keep fixed footers above the iPhone home indicator even during the same zero-inset first render.
  const bottomInset = insets.bottom > 0
    ? insets.bottom
    : Platform.OS === 'ios'
      ? IOS_BOTTOM_FALLBACK
      : 0;

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onRequestClose}
    >
      <StatusBar style={statusBarStyle} />
      <View
        style={[
          styles.container,
          {
            backgroundColor,
            paddingTop: topInset,
            paddingBottom: bottomInset,
          },
        ]}
      >
        {children}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SafeFullScreenModal;
