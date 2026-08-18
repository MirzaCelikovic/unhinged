import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import ChoiceQuestion from '~/components/onboarding/ChoiceQuestion';
import { AgeGroup } from '~/lib/storage';

const AGE_CHOICE_IDS: AgeGroup[] = ['18_24', '25_34', '35_plus'];

interface AgePromptProps {
  onSelect: (ageGroup: AgeGroup) => void;
}

// One-time age capture for users who completed onboarding before age-based pricing
// existed (COM-6). Shown once, immediately before the launch paywall, so existing
// users get the correct age-priced offering instead of the default fallback.
export default function AgePrompt({ onSelect }: AgePromptProps) {
  const { t } = useTranslation('settings');

  const choices = AGE_CHOICE_IDS.map((id) => ({ id, label: t(`age.range.${id}`) }));

  return (
    <View style={StyleSheet.absoluteFill} className="bg-background">
      <SafeAreaView className="flex-1">
        <View className="flex-1 pt-24">
          <ChoiceQuestion
            question={t('age.question')}
            choices={choices}
            onSelect={(id) => onSelect(id as AgeGroup)}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
