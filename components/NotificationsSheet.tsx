import React, { forwardRef, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

interface NotificationsSheetProps {
  onEnableNotifications: () => void;
  onDismiss: () => void;
}

const NotificationsSheet = forwardRef<BottomSheetModal, NotificationsSheetProps>(
  ({ onEnableNotifications, onDismiss }, ref) => {
    const snapPoints = useMemo(() => ['50%'], []);

    const renderBackdrop = useMemo(
      () => (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      []
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        onDismiss={onDismiss}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView className="flex-1 p-6">
          <Text className="text-2xl font-bold text-gray-900 mb-3">
            Stay Updated
          </Text>
          <Text className="text-base text-gray-700 mb-6">
            Enable notifications to get instant updates about your Instagram followers and account activity.
          </Text>

          <Pressable
            className="bg-blue-500 py-4 rounded-lg active:bg-blue-600 mb-3"
            onPress={onEnableNotifications}
          >
            <Text className="text-center font-semibold text-white text-base">
              Enable Notifications
            </Text>
          </Pressable>

          <Pressable
            className="py-3 active:opacity-70"
            onPress={onDismiss}
          >
            <Text className="text-center font-medium text-gray-500 text-base">
              Maybe Later
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

NotificationsSheet.displayName = 'NotificationsSheet';

export default NotificationsSheet;
