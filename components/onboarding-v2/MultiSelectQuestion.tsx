import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Circle, CircleCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Button from '~/components/Button';

interface Choice {
  id: string;
  label: string;
}

interface MultiSelectQuestionProps {
  question: string;
  subtitle?: string;
  choices: Choice[];
  onSubmit: (selectedIds: string[]) => void;
}

export default function MultiSelectQuestion({
  question,
  subtitle,
  choices,
  onSubmit,
}: MultiSelectQuestionProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleChoice = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="mb-2 text-center font-roboto-extrablack text-4xl">{question}</Text>
        {subtitle && (
          <Text className="mb-6 text-center font-roboto text-base text-black">{subtitle}</Text>
        )}

        <View className="gap-3">
          {choices.map((choice) => {
            const isSelected = selected.has(choice.id);
            return (
              <Pressable
                key={choice.id}
                onPress={() => toggleChoice(choice.id)}
                className="flex-row items-center rounded-2xl bg-white px-5 py-4 active:opacity-80">
                {isSelected ? (
                  <CircleCheck size={24} color="#000000" />
                ) : (
                  <Circle size={24} color="#000000" />
                )}
                <Text className="ml-3 font-roboto-medium text-base">{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <LinearGradient
          colors={['#FFE51F00', '#FFE51FCC']}
          style={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 48 }}>
          <Button label={t('v2MultiSelect.continue')} onPress={() => onSubmit(Array.from(selected))} />
        </LinearGradient>
      </View>
    </View>
  );
}
