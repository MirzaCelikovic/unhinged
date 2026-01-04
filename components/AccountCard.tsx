import { View, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';

interface AccountCardProps {
  username: string;
  profilePicUrl?: string | null;
  label?: string;
  timestamp?: string;
  isRow?: boolean;
  isLastRow?: boolean;
  actionLabel?: string;
  actionVariant?: 'primary' | 'secondary';
  actionLoading?: boolean;
  onAction?: () => void;
  onPress?: () => void;
  blurred?: boolean;
}

export default function AccountCard({
  username,
  profilePicUrl,
  label,
  timestamp,
  isRow = false,
  isLastRow = false,
  actionLabel,
  actionVariant = 'primary',
  actionLoading = false,
  onAction,
  onPress,
  blurred = false,
}: AccountCardProps) {
  const containerClass = isRow
    ? `p-4 ${!isLastRow ? 'border-b border-gray-100' : ''}`
    : 'rounded-2xl bg-white p-4';

  const buttonClass = actionVariant === 'primary'
    ? 'bg-black px-4 py-2 rounded-full'
    : 'bg-gray-200 px-4 py-2 rounded-full';

  const buttonTextClass = actionVariant === 'primary'
    ? 'font-roboto-medium text-sm text-white'
    : 'font-roboto-medium text-sm text-gray-700';

  const content = (
    <View className="relative flex-row items-center gap-3">
      {/* Profile picture */}
      <View className="relative overflow-hidden rounded-full">
        {profilePicUrl ? (
          <Image source={{ uri: profilePicUrl }} className="h-12 w-12 rounded-full" />
        ) : (
          <View className="h-12 w-12 rounded-full bg-gray-200" />
        )}
        {blurred && (
          <BlurView
            intensity={20}
            tint="light"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}
      </View>

      {/* Username and label */}
      <View className="relative flex-1">
        <Text className="font-roboto-medium text-base text-gray-900">@{username}</Text>
        {label && (
          <Text className="font-roboto-regular text-sm text-gray-500">{label}</Text>
        )}
        {blurred && (
          <BlurView
            intensity={12}
            tint="light"
            style={{
              position: 'absolute',
              top: -4,
              left: -8,
              right: -4,
              bottom: -4,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          />
        )}
      </View>

      {timestamp && (
        <Text className="font-roboto-regular text-sm text-gray-400">{timestamp}</Text>
      )}
      {actionLabel && onAction && (
        <Pressable
          className={`${buttonClass} active:opacity-70`}
          onPress={onAction}
          disabled={actionLoading}>
          {actionLoading ? (
            <ActivityIndicator size="small" color={actionVariant === 'primary' ? '#fff' : '#374151'} />
          ) : (
            <Text className={buttonTextClass}>{actionLabel}</Text>
          )}
        </Pressable>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable className={`${containerClass} active:opacity-70`} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View className={containerClass}>{content}</View>;
}
