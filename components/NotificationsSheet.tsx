import React, { forwardRef, memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { CircleCheck } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import Button from '~/components/Button';

interface NotificationsSheetProps {
  onEnableNotifications: () => void;
  onMaybeLater: () => void;
}

const NotificationsSheetComponent = forwardRef<BottomSheetModal, NotificationsSheetProps>(
  ({ onEnableNotifications, onMaybeLater }, ref) => {
    const { t } = useTranslation('settings');
    const snapPoints = useMemo(() => ['50%'], []);
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
            <Text className="mb-3 font-roboto-extrablack text-3xl text-black">
              {t('sheet.title')}
            </Text>
            <View className="mb-6 gap-3 py-4">
              <View className="flex-row items-center gap-3">
                <CircleCheck size={22} color="#000000" />
                <Text className="flex-1 font-roboto-medium text-lg text-black">
                  {t('sheet.benefit.crush')}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <CircleCheck size={22} color="#000000" />
                <Text className="flex-1 font-roboto-medium text-lg text-black">
                  {t('sheet.benefit.ex')}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <CircleCheck size={22} color="#000000" />
                <Text className="flex-1 font-roboto-medium text-lg text-black">
                  {t('sheet.benefit.unfollows')}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <CircleCheck size={22} color="#000000" />
                <Text className="flex-1 font-roboto-medium text-lg text-black">
                  {t('sheet.benefit.suspicious')}
                </Text>
              </View>
            </View>

            <Button label={t('sheet.cta.enable')} onPress={onEnableNotifications} />

            <Pressable className="py-3 active:opacity-70" onPress={onMaybeLater}>
              <Text className="text-center font-roboto-medium text-base text-gray-500">
                {t('sheet.cta.maybeLater')}
              </Text>
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

export default memo(NotificationsSheetComponent);
