import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import ChoiceQuestion from '~/components/onboarding/ChoiceQuestion';
import { AgeGroup } from '~/lib/storage';

interface AgePromptProps {
  onSelect: (ageGroup: AgeGroup) => void;
}

// One-time age capture for users who completed onboarding before age-based pricing
// existed (COM-6). Shown once, immediately before the launch paywall, so existing
// users get the correct age-priced offering instead of the default fallback.
export default function AgePrompt({ onSelect }: AgePromptProps) {
  const { t } = useTranslation();
  const AGE_CHOICES: { id: AgeGroup; label: string }[] = [
    { id: '18_24', label: t('agePrompt.choice1824') },
    { id: '25_34', label: t('agePrompt.choice2534') },
    { id: '35_plus', label: t('agePrompt.choice35plus') },
  ];
  return (
    <View style={StyleSheet.absoluteFill} className="bg-background">
      <SafeAreaView className="flex-1">
        <View className="flex-1 pt-24">
          <ChoiceQuestion
            question={t('agePrompt.question')}
            choices={AGE_CHOICES}
            onSelect={(id) => onSelect(id as AgeGroup)}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
