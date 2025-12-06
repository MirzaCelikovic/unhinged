import { Pressable, Text, View } from 'react-native';
import { Plus, ArrowRight } from 'lucide-react-native';

type ButtonMode = 'add' | 'next';

interface ButtonProps {
  label: string;
  onPress: () => void;
  mode?: ButtonMode;
  disabled?: boolean;
  fullWidth?: boolean;
}

export default function Button({
  label,
  onPress,
  mode,
  disabled = false,
  fullWidth = true,
}: ButtonProps) {
  const renderIcon = () => {
    if (!mode) return null;

    const iconProps = {
      size: 20,
      color: '#ffffff',
    };

    switch (mode) {
      case 'add':
        return <Plus {...iconProps} />;
      case 'next':
        return <ArrowRight {...iconProps} />;
      default:
        return null;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-3xl bg-black px-6 py-4 active:opacity-80 ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <View className="flex-row items-center justify-between">
        <Text className="font-roboto-medium text-lg text-white">{label}</Text>
        {renderIcon()}
      </View>
    </Pressable>
  );
}
