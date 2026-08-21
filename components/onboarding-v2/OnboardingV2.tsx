import { useState, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { CircleChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import ChoiceQuestion from '~/components/onboarding/ChoiceQuestion';
import TrackSearch from '~/components/onboarding-v2/TrackSearch';
import StartScreen from '~/components/onboarding-v2/StartScreen';
import MultiSelectQuestion from '~/components/onboarding-v2/MultiSelectQuestion';
import AnalyzingScreen from '~/components/onboarding-v2/AnalyzingScreen';
import RevealScreen from '~/components/onboarding-v2/RevealScreen';
import Logo from '~/assets/logo_black.svg';
import { Instagram } from '~/lib/types';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import { setAgeGroup, AgeGroup, getOnboardingProgress, setOnboardingProgress } from '~/lib/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingV2Props {
  onComplete: () => void;
}

interface ChoiceStep {
  id: string;
  type: 'choice';
  questionKey: string;
  choices: { id: string; labelKey: string }[];
}

interface TrackStep {
  id: string;
  type: 'track';
}

interface MultiSelectStep {
  id: string;
  type: 'multiselect';
  questionKey: string;
  subtitleKey?: string;
  choices: { id: string; labelKey: string }[];
}

interface AnalyzingStep {
  id: string;
  type: 'analyzing';
}

interface RevealStep {
  id: string;
  type: 'reveal';
}

interface StartStep {
  id: string;
  type: 'start';
}

type Step = StartStep | ChoiceStep | MultiSelectStep | TrackStep | AnalyzingStep | RevealStep;

const STEPS: Step[] = [
  {
    id: 'start',
    type: 'start',
  },
  {
    id: 'who',
    type: 'choice',
    questionKey: 'onboardingV2.root.whoQuestion',
    choices: [
      { id: 'boyfriend', labelKey: 'onboardingV2.root.whoOptionBoyfriend' },
      { id: 'girlfriend', labelKey: 'onboardingV2.root.whoOptionGirlfriend' },
      { id: 'ex', labelKey: 'onboardingV2.root.whoOptionEx' },
      { id: 'talking_to', labelKey: 'onboardingV2.root.whoOptionTalkingTo' },
      { id: 'friend', labelKey: 'onboardingV2.root.whoOptionFriend' },
      { id: 'someone_else', labelKey: 'onboardingV2.root.whoOptionSomeoneElse' },
    ],
  },
  {
    id: 'age',
    type: 'choice',
    questionKey: 'onboardingV2.root.ageQuestion',
    choices: [
      { id: '18_24', labelKey: 'onboardingV2.root.ageOption1824' },
      { id: '25_34', labelKey: 'onboardingV2.root.ageOption2534' },
      { id: '35_plus', labelKey: 'onboardingV2.root.ageOption35Plus' },
    ],
  },
  {
    id: 'alarm_bells',
    type: 'multiselect',
    questionKey: 'onboardingV2.root.alarmBellsQuestion',
    subtitleKey: 'onboardingV2.root.alarmBellsSubtitle',
    choices: [
      { id: 'phone', labelKey: 'onboardingV2.root.alarmBellsOptionPhone' },
      { id: 'hides_screen', labelKey: 'onboardingV2.root.alarmBellsOptionHidesScreen' },
      { id: 'thirst_traps', labelKey: 'onboardingV2.root.alarmBellsOptionThirstTraps' },
      { id: 'fitness_models', labelKey: 'onboardingV2.root.alarmBellsOptionFitnessModels' },
      { id: 'weird_hours', labelKey: 'onboardingV2.root.alarmBellsOptionWeirdHours' },
      { id: 'new_followers', labelKey: 'onboardingV2.root.alarmBellsOptionNewFollowers' },
      { id: 'weird_notifications', labelKey: 'onboardingV2.root.alarmBellsOptionWeirdNotifications' },
      { id: 'changed_password', labelKey: 'onboardingV2.root.alarmBellsOptionChangedPassword' },
    ],
  },
  {
    id: 'track_username',
    type: 'track',
  },
  {
    id: 'analyzing',
    type: 'analyzing',
  },
  {
    id: 'reveal',
    type: 'reveal',
  },
];

export default function OnboardingV2({ onComplete }: OnboardingV2Props) {
  const { t } = useTranslation();
  // Resume in-progress onboarding (COM-38): a user who backgrounds/relaunches
  // mid-quiz picks up where they left off instead of restarting. Both arms — a
  // neutral change that keeps the A/B difference to dismissibility only. Cleared
  // on completion (start.tsx finishOnboarding).
  const [savedProgress] = useState(() => getOnboardingProgress());
  const [currentStep, setCurrentStep] = useState(
    Math.min(Math.max(savedProgress?.step ?? 0, 0), STEPS.length - 1),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(savedProgress?.answers ?? {});
  const [trackProfile, setTrackProfile] = useState<Instagram | null>(
    (savedProgress?.trackProfile as Instagram | null) ?? null,
  );
  const { track } = useAnalytics();

  // Progress bar excludes the start step (step 0)
  const stepsWithProgress = STEPS.length - 1;
  const progressWidth = useSharedValue(
    (Math.max(savedProgress?.step ?? 1, 1) / stepsWithProgress) * 100,
  );
  const step = STEPS[currentStep];

  useEffect(() => {
    setOnboardingProgress({ step: currentStep, answers, trackProfile });
  }, [currentStep, answers, trackProfile]);

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const goToStep = (newStep: number) => {
    setCurrentStep(newStep);
    progressWidth.value = withTiming((Math.max(newStep, 1) / stepsWithProgress) * 100, { duration: 300 });
  };

  const handleBack = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep === STEPS.length - 1) {
      onComplete();
    } else {
      goToStep(currentStep + 1);
    }
  };

  const handleSelect = (choiceId: string) => {
    if (step.id === 'who') {
      track(Events.WHO_COMPLETED, { who: choiceId });
    }
    if (step.id === 'age') {
      // Persist synchronously so the paywall can read it to pick the
      // age-specific RevenueCat offering (COM-6).
      setAgeGroup(choiceId as AgeGroup);
      track(Events.AGE_SELECTED, { age_group: choiceId, source: 'onboarding' });
    }
    setAnswers({ ...answers, [step.id]: choiceId });
    handleNext();
  };

  const isStartStep = step.type === 'start';

  return (
    <View className="flex-1">
      {/* Header with back button, logo, and progress bar */}
      {!isStartStep && (
        <View className="px-4 pt-2">
          <View className="mb-4 flex-row items-center">
            <Pressable onPress={handleBack} className="p-2 active:opacity-70">
              <CircleChevronLeft size={28} color="#000000" />
            </Pressable>
            <View className="flex-1 items-center">
              <Logo width={160} height={50} />
            </View>
            <View className="w-[44px]" />
          </View>

          {/* Progress bar */}
          <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)' }}>
            <Animated.View className="h-full rounded-full bg-black" style={progressAnimatedStyle} />
          </View>
        </View>
      )}

      {/* Content */}
      <View className={`flex-1 ${isStartStep ? '' : 'pt-4'}`}>
        <Animated.View
          key={step.id}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          className="flex-1">
          {step.type === 'start' && <StartScreen onNext={handleNext} />}
          {step.type === 'multiselect' && (
            <MultiSelectQuestion
              question={t((step as MultiSelectStep).questionKey)}
              subtitle={(step as MultiSelectStep).subtitleKey ? t((step as MultiSelectStep).subtitleKey!) : undefined}
              choices={(step as MultiSelectStep).choices.map((choice) => ({ id: choice.id, label: t(choice.labelKey) }))}
              onSubmit={(selectedIds) => {
                track(Events.ALARM_BELLS_COMPLETED, { selections: selectedIds });
                setAnswers({ ...answers, [step.id]: selectedIds.join(',') });
                handleNext();
              }}
            />
          )}
          {step.type === 'choice' && (
            <ChoiceQuestion
              question={t((step as ChoiceStep).questionKey)}
              choices={(step as ChoiceStep).choices.map((choice) => ({ id: choice.id, label: t(choice.labelKey) }))}
              onSelect={handleSelect}
            />
          )}
          {step.type === 'track' && (
            <TrackSearch
              whoAnswer={answers['who'] || ''}
              onNext={(username, profile) => {
                setAnswers({ ...answers, track_username: username });
                setTrackProfile(profile);

                // Stash locally so we can auto-track after Instagram connection
                AsyncStorage.setItem('pending_track', JSON.stringify({
                  user_id: profile.user_id,
                  username: profile.username,
                }));

                handleNext();
              }}
            />
          )}
          {step.type === 'analyzing' && (
            <AnalyzingScreen
              username={answers['track_username'] || ''}
              onNext={handleNext}
            />
          )}
          {step.type === 'reveal' && (
            <RevealScreen
              username={answers['track_username'] || ''}
              profilePicUrl={trackProfile?.profile_pic_url ?? undefined}
              fullName={trackProfile?.full_name ?? undefined}
              biography={trackProfile?.biography ?? undefined}
              mediaCount={trackProfile?.media_count}
              followingCount={trackProfile?.following_count}
              followersCount={trackProfile?.followers_count}
              onNext={onComplete}
            />
          )}
        </Animated.View>
      </View>
    </View>
  );
}
