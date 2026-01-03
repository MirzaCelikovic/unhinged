import { View, Text, TextInput, TextInputProps } from 'react-native';
import { useState, ReactNode } from 'react';

interface TextFieldProps extends TextInputProps {
  error?: string;
  icon?: ReactNode;
}

export default function TextField({ error, icon, ...props }: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className="w-full">
      <View className="overflow-hidden rounded-3xl bg-white">
        <View className="flex-row items-center px-4 pb-3 pt-2">
          {icon && <View className="mr-3 mt-2">{icon}</View>}
          <TextInput
            className="min-h-[34px] flex-1 font-roboto-medium text-lg text-black"
            placeholderTextColor="#9ca3af"
            style={{ paddingVertical: 0, textAlignVertical: 'center' }}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
        </View>
        <View
          className={`h-[2px] ${error ? 'bg-error' : isFocused ? 'bg-black' : 'bg-transparent'}`}
        />
      </View>
      {error && <Text className="font-roboto-regular mt-2 px-2 text-sm text-error">{error}</Text>}
    </View>
  );
}
