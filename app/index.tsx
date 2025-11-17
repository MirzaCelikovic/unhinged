import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useInstagram } from '~/contexts/InstagramContext';

export default function Index() {
  const { isLoggedIn, isSyncing, showLogin, disconnect } = useInstagram();

  const getButtonConfig = () => {
    if (isLoggedIn === null) {
      return {
        text: 'Logging in...',
        color: 'bg-gray-400',
        activeColor: 'active:bg-gray-400',
        onPress: () => {},
        disabled: true,
        showSpinner: true,
      };
    } else if (isLoggedIn) {
      return {
        text: 'Disconnect Account',
        color: 'bg-red-500',
        activeColor: 'active:bg-red-600',
        onPress: disconnect,
        disabled: false,
        showSpinner: false,
      };
    } else {
      return {
        text: 'Connect Account',
        color: 'bg-blue-500',
        activeColor: 'active:bg-blue-600',
        onPress: showLogin,
        disabled: false,
        showSpinner: false,
      };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <View className="items-center gap-3">
        <Pressable
          className={`${buttonConfig.color} px-6 py-3 rounded-lg ${buttonConfig.activeColor} flex-row items-center gap-2`}
          onPress={buttonConfig.onPress}
          disabled={buttonConfig.disabled}
        >
          {buttonConfig.showSpinner && (
            <ActivityIndicator color="white" size="small" />
          )}
          <Text className="text-white text-lg font-semibold">{buttonConfig.text}</Text>
        </Pressable>

        {isSyncing && (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color="#6b7280" size="small" />
            <Text className="text-gray-500 text-sm">Syncing...</Text>
          </View>
        )}
      </View>
    </View>
  );
}
