import React, { forwardRef, memo, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import Circles from '~/assets/circles.svg';
import Button from '~/components/Button';

interface SessionExpiredSheetProps {
  onReconnect: () => void;
  onMaybeLater: () => void;
}

const SessionExpiredSheetComponent = forwardRef<BottomSheetModal, SessionExpiredSheetProps>(
  ({ onReconnect, onMaybeLater }, ref) => {
    const snapPoints = useMemo(() => ['40%'], []);
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      []
    );

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: '#FFE51F' }}
        handleIndicatorStyle={{ backgroundColor: '#000000' }}>
        <BottomSheetView className="flex-1">
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            className="items-center justify-start">
            <Circles width={700} height={700} />
          </View>
          <View className="flex-1 p-6">
            <Text className="mb-4 font-roboto-extrablack text-3xl text-black">Session expired</Text>
            <Text className="mb-8 mt-2 font-roboto-medium text-lg text-black">
              Your Instagram session has expired. Reconnect to sync new activity and keep tracking
              followers.
            </Text>

            <Button label="Reconnect Instagram" onPress={onReconnect} />

            <Pressable className="py-3 active:opacity-70" onPress={onMaybeLater}>
              <Text className="text-center font-roboto-medium text-base text-gray-500">
                Maybe later
              </Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

export default memo(SessionExpiredSheetComponent);
