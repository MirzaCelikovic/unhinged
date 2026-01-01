import { View, Text, Pressable } from 'react-native';
import { LockKeyhole, Shield, FolderCheck, EyeOff } from 'lucide-react-native';
import IgGradient from '~/assets/ig_gradient.svg';

interface ConnectScreenProps {
  onConnect: () => void;
  onSkip: () => void;
}

export default function ConnectScreen({ onConnect, onSkip }: ConnectScreenProps) {
  return (
    <View className="flex-1 px-4">
      <Text className="text-center font-roboto-extrablack text-4xl tracking-tighter">
        They'll never know you're watching
      </Text>
      <View className="mt-3 flex-row items-center justify-center">
        <LockKeyhole size={16} color="#000000" />
        <Text className="font-roboto ml-2 text-center text-base text-black">
          Your data is fully secure
        </Text>
      </View>

      <View className="mt-10 flex-1">
        <View className="mb-8 flex-row">
          <Shield size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">Bank Level Security</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              Protected Sync. Log into Instagram. Your connection is secured with bank-grade encryption.
            </Text>
          </View>
        </View>

        <View className="mb-8 flex-row">
          <FolderCheck size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">Secure and Local</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              Private, by design. Your data resides securely on your device, giving you total control. We simply don't have the keys to see it.
            </Text>
          </View>
        </View>

        <View className="flex-row">
          <EyeOff size={28} color="#000000" />
          <View className="ml-4 flex-1">
            <Text className="font-roboto-bold text-lg">Discreet & Private</Text>
            <Text className="font-roboto mt-1 text-base text-black">
              Nobody knows you're using Unhinged. Your activity on Unhinged remains known only to you.
            </Text>
          </View>
        </View>
      </View>

      <View className="pb-8">
        <Pressable onPress={onConnect} className="w-full overflow-hidden rounded-3xl active:opacity-80">
          <View className="items-center justify-center">
            <IgGradient width="100%" height={56} preserveAspectRatio="none" />
            <Text className="absolute font-roboto-medium text-lg text-white">Connect Instagram</Text>
          </View>
        </Pressable>
        <Pressable className="mt-4 py-3" onPress={onSkip}>
          <Text className="text-center font-roboto-medium text-base text-black">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
