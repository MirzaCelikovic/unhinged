import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useInstagram } from '~/contexts/InstagramContext';

export default function Settings() {
  const { disconnect, isLoggedIn } = useInstagram();

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="p-4">
        {/* Settings Section */}
        <View className="mt-4">
          <Text className="text-base font-medium text-gray-500 uppercase mb-3">Settings</Text>
          <View className="bg-gray-100 rounded-2xl overflow-hidden">
            <Pressable
              className="p-4 flex-row items-center justify-between active:bg-gray-200"
              onPress={() => router.push('/settings/notifications')}
            >
              <Text className="text-base font-medium text-gray-900">Notifications</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </Pressable>
          </View>
        </View>

        {/* Danger Zone Section */}
        <View className="mt-4">
          <Text className="text-base font-medium text-gray-500 uppercase mb-3">Danger Zone</Text>
          <View className="bg-gray-100 rounded-2xl overflow-hidden">
            <Pressable
              className="p-4 active:bg-gray-200"
              onPress={disconnect}
              disabled={!isLoggedIn}
            >
              <Text className={`text-base font-medium ${isLoggedIn ? 'text-red-600' : 'text-gray-400'}`}>
                Disconnect Instagram
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
