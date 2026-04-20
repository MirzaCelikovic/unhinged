import { useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { CircleChevronLeft } from 'lucide-react-native';
import ChoiceQuestion from '~/components/onboarding/ChoiceQuestion';
import TrackSearch from '~/components/onboarding-v2/TrackSearch';
import StartScreen from '~/components/onboarding-v2/StartScreen';
import MultiSelectQuestion from '~/components/onboarding-v2/MultiSelectQuestion';
import AnalyzingScreen from '~/components/onboarding-v2/AnalyzingScreen';
import RevealScreen from '~/components/onboarding-v2/RevealScreen';
import Logo from '~/assets/logo_black.svg';
import { Instagram } from '~/lib/types';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
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

const STEPS: Step[] = [
  {
    id: 'start',
    type: 'start',
  },
  {
    id: 'who',
    type: 'choice',
    question: "Who\u2019s got you feeling\nthis way?",
    choices: [
      { id: 'boyfriend', label: 'My boyfriend' },
      { id: 'girlfriend', label: 'My girlfriend' },
      { id: 'ex', label: 'My ex' },
      { id: 'talking_to', label: "Someone I\u2019m talking to" },
      { id: 'friend', label: "A \u2018friend\u2019 I don\u2019t really trust" },
      { id: 'someone_else', label: 'Someone else' },
    ],
  },
  {
    id: 'alarm_bells',
    type: 'multiselect',
    question: "What\u2019s been setting off\nalarm bells?",
    subtitle: "Check everything that sounds familiar.\nNo one sees this but you.",
    choices: [
      { id: 'phone', label: 'On their phone way more than usual' },
      { id: 'hides_screen', label: 'Hides screen when I walk up' },
      { id: 'thirst_traps', label: "Liking random girls\u2019/guys\u2019 thirst traps" },
      { id: 'fitness_models', label: 'Following new fitness models' },
      { id: 'weird_hours', label: 'Active on IG at weird hours' },
      { id: 'new_followers', label: "New followers I\u2019ve never heard of" },
      { id: 'weird_notifications', label: 'Getting weird notifications' },
      { id: 'changed_password', label: 'Changed their password' },
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
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [trackProfile, setTrackProfile] = useState<Instagram | null>(null);
  const { track } = useAnalytics();

  // Progress bar excludes the start step (step 0)
  const stepsWithProgress = STEPS.length - 1;
  const progressWidth = useSharedValue((1 / stepsWithProgress) * 100);
  const step = STEPS[currentStep];

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
