import React, { createContext, useContext, useRef } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import NotificationsSheet from '~/components/NotificationsSheet';
import * as Notifications from 'expo-notifications';
import { CustomerIO } from 'customerio-reactnative';
import { Platform } from 'react-native';

interface SheetContextType {
  showNotificationsSheet: () => void;
}

const SheetContext = createContext<SheetContextType | undefined>(undefined);

export const useSheets = () => {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error('useSheets must be used within SheetProvider');
  }
  return context;
};

export const SheetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const notificationsSheetRef = useRef<BottomSheetModal>(null);

  const showNotificationsSheet = () => {
    notificationsSheetRef.current?.present();
  };

  const handleEnableNotifications = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    console.log('Notification permission status:', status);

    if (status === 'granted') {
      // Register device push token with Customer.io
      try {
        const { data: deviceToken } = await Notifications.getDevicePushTokenAsync();
        if (Platform.OS === 'ios' && deviceToken) {
          console.log('🔧 Registering iOS push token with Customer.io:', deviceToken);
          CustomerIO.registerDeviceToken(deviceToken);
        }
      } catch (error) {
        console.log('⚠️ Could not get push token:', error);
      }
    }

    notificationsSheetRef.current?.dismiss();
  };

  const handleDismissSheet = () => {
    console.log('Notifications sheet dismissed');
  };

  const value: SheetContextType = {
    showNotificationsSheet,
  };

  return (
    <SheetContext.Provider value={value}>
      {children}
      <NotificationsSheet
        ref={notificationsSheetRef}
        onEnableNotifications={handleEnableNotifications}
        onDismiss={handleDismissSheet}
      />
    </SheetContext.Provider>
  );
};
