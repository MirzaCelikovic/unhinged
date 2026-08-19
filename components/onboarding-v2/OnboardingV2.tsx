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
  question: string;
  choices: { id: string; label: string }[];
}

interface TrackStep {
  id: string;
  type: 'track';
}

interface MultiSelectStep {
  id: string;
  type: 'multiselect';
  question: string;
  subtitle?: string;
  choices: { id: string; label: string }[];
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

export default function OnboardingV2({ onComplete }: OnboardingV2Props) {
  const { t } = useTranslation();

  const STEPS: Step[] = [
    {
      id: 'start',
      type: 'start',
    },
    {
      id: 'who',
      type: 'choice',
      question: t('onboardingV2.who.question'),
      choices: [
        { id: 'boyfriend', label: t('onboardingV2.who.boyfriend') },
        { id: 'girlfriend', label: t('onboardingV2.who.girlfriend') },
        { id: 'ex', label: t('onboardingV2.who.ex') },
        { id: 'talking_to', label: t('onboardingV2.who.talkingTo') },
        { id: 'friend', label: t('onboardingV2.who.friend') },
        { id: 'someone_else', label: t('onboardingV2.who.someoneElse') },
      ],
    },
    {
      id: 'age',
      type: 'choice',
      question: t('onboarding.age.question'),
      choices: [
        { id: '18_24', label: t('onboarding.age.1824') },
        { id: '25_34', label: t('onboarding.age.2534') },
        { id: '35_plus', label: t('onboarding.age.35plus') },
      ],
    },
    {
      id: 'alarm_bells',
      type: 'multiselect',
      question: t('onboardingV2.alarmBells.question'),
      subtitle: t('onboardingV2.alarmBells.subtitle'),
      choices: [
        { id: 'phone', label: t('onboardingV2.alarmBells.phone') },
        { id: 'hides_screen', label: t('onboardingV2.alarmBells.hidesScreen') },
        { id: 'thirst_traps', label: t('onboardingV2.alarmBells.thirstTraps') },
        { id: 'fitness_models', label: t('onboardingV2.alarmBells.fitnessModels') },
        { id: 'weird_hours', label: t('onboardingV2.alarmBells.weirdHours') },
        { id: 'new_followers', label: t('onboardingV2.alarmBells.newFollowers') },
        { id: 'weird_notifications', label: t('onboardingV2.alarmBells.weirdNotifications') },
        { id: 'changed_password', label: t('onboardingV2.alarmBells.changedPassword') },
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
              question={(step as MultiSelectStep).question}
              subtitle={(step as MultiSelectStep).subtitle}
              choices={(step as MultiSelectStep).choices}
              onSubmit={(selectedIds) => {
                track(Events.ALARM_BELLS_COMPLETED, { selections: selectedIds });
                setAnswers({ ...answers, [step.id]: selectedIds.join(',') });
                handleNext();
              }}
            />
          )}
          {step.type === 'choice' && (
            <ChoiceQuestion
              question={(step as ChoiceStep).question}
              choices={(step as ChoiceStep).choices}
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
