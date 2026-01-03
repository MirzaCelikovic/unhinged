import { View, Text, Image } from 'react-native';

interface AccountCardProps {
  username: string;
  profilePicUrl?: string | null;
  label?: string;
  timestamp?: string;
}

export default function AccountCard({
  username,
  profilePicUrl,
  label,
  timestamp,
}: AccountCardProps) {
  return (
    <View className="rounded-2xl bg-white p-4">
      <View className="flex-row items-center gap-3">
        {profilePicUrl ? (
          <Image source={{ uri: profilePicUrl }} className="h-12 w-12 rounded-full" />
        ) : (
          <View className="h-12 w-12 rounded-full bg-gray-200" />
        )}
        <View className="flex-1">
          <Text className="font-roboto-medium text-base text-gray-900">@{username}</Text>
          {label && (
            <Text className="font-roboto-regular text-sm text-gray-500">{label}</Text>
          )}
        </View>
        {timestamp && (
          <Text className="font-roboto-regular text-sm text-gray-400">{timestamp}</Text>
        )}
      </View>
    </View>
  );
}
