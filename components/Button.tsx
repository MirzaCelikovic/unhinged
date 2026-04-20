import { Pressable, Text, View } from 'react-native';
import Spinner from '~/components/Spinner';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  fullWidth = true,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`rounded-2xl bg-black px-6 py-4 active:opacity-80 ${fullWidth ? 'w-full' : ''} ${disabled || loading ? 'opacity-80' : ''}`}>
      <View className="flex-row items-center justify-center" style={{ minHeight: 24 }}>
        {loading ? (
          <Spinner size={20} color="#ffffff" />
        ) : (
          <Text className="font-roboto-medium text-lg text-white">{label}</Text>
        )}
      </View>
    </Pressable>
  );
}
