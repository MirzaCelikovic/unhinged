import { View, Text, Pressable } from 'react-native';
import { CircleChevronRight } from 'lucide-react-native';

interface Choice {
  id: string;
  label: string;
}

interface ChoiceQuestionProps {
  question: string;
  choices: Choice[];
  onSelect: (choiceId: string) => void;
}

export default function ChoiceQuestion({ question, choices, onSelect }: ChoiceQuestionProps) {
  return (
    <View className="flex-1 px-4">
      <Text className="mb-8 text-center font-roboto-black text-4xl">{question}</Text>

      <View className="gap-3">
        {choices.map((choice) => (
          <Pressable
            key={choice.id}
            onPress={() => onSelect(choice.id)}
            className="flex-row items-center justify-between rounded-2xl bg-white px-5 py-5 active:opacity-80">
            <Text className="font-roboto-medium text-lg">{choice.label}</Text>
            <CircleChevronRight size={24} color="#000000" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
