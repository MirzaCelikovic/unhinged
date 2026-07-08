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
import ChoiceQuestion from '~/components/onboarding/ChoiceQuestion';
import UsernameSearch from '~/components/onboarding/UsernameSearch';
import TrackSearch from '~/components/onboarding/TrackSearch';
import HelpScreen1 from '~/components/onboarding/HelpScreen1';
import HelpScreen2 from '~/components/onboarding/HelpScreen2';
import NotificationConsent from '~/components/onboarding/NotificationConsent';
import ReviewScreen from '~/components/onboarding/ReviewScreen';
import StatsScreen from '~/components/onboarding/StatsScreen';
import ComparisonScreen from '~/components/onboarding/ComparisonScreen';
import ConnectScreen from '~/components/onboarding/ConnectScreen';
import StartScreen from '~/components/onboarding/StartScreen';
import Logo from '~/assets/logo_black.svg';
import { Instagram } from '~/lib/types';
import { useInstagram } from '~/contexts/InstagramContext';
import { useAccountContext } from '~/contexts/AccountContext';
import { useAnalytics, Events } from '~/contexts/AnalyticsContext';
import i18n from '~/lib/i18n';

interface OnboardingProps {
  onComplete: () => void;
}

interface ChoiceStep {
  id: string;
  type: 'choice';
  question: string;
  choices: { id: string; label: string }[];
}

interface UsernameStep {
  id: string;
  type: 'username';
}

interface TrackStep {
  id: string;
  type: 'track';
}

interface HelpStep {
  id: string;
  type: 'help1' | 'help2';
}

interface NotificationsStep {
  id: string;
  type: 'notifications';
}

interface ReviewStep {
  id: string;
  type: 'review';
}

interface StatsStep {
  id: string;
  type: 'stats';
}

interface ComparisonStep {
  id: string;
  type: 'comparison';
}

interface StartStep {
  id: string;
  type: 'start';
}

interface ConnectStep {
  id: string;
  type: 'connect';
}

type Step = StartStep | ChoiceStep | UsernameStep | TrackStep | HelpStep | NotificationsStep | ReviewStep | StatsStep | ComparisonStep | ConnectStep;

const STEPS: Step[] = [
  {
    id: 'start',
    type: 'start',
  },
  {
    id: 'source',
    type: 'choice',
    question: i18n.t('onboarding.main.source.question'),
    choices: [
      { id: 'friends', label: i18n.t('onboarding.main.source.friends') },
      { id: 'tiktok', label: i18n.t('onboarding.main.source.tiktok') },
      { id: 'instagram', label: i18n.t('onboarding.main.source.instagram') },
      { id: 'facebook', label: i18n.t('onboarding.main.source.facebook') },
      { id: 'google', label: i18n.t('onboarding.main.source.google') },
      { id: 'other', label: i18n.t('onboarding.main.source.other') },
    ],
  },
  {
    id: 'username',
    type: 'username',
  },
  {
    id: 'help_with',
    type: 'choice',
    question: i18n.t('onboarding.main.helpWith.question'),
    choices: [
      { id: 'track', label: i18n.t('onboarding.main.helpWith.track') },
      { id: 'not_following_back', label: i18n.t('onboarding.main.helpWith.notFollowingBack') },
      { id: 'stories', label: i18n.t('onboarding.main.helpWith.stories') },
      { id: 'red_flags', label: i18n.t('onboarding.main.helpWith.redFlags') },
      { id: 'wrapped', label: i18n.t('onboarding.main.helpWith.wrapped') },
    ],
  },
  {
    id: 'track_username',
    type: 'track',
  },
  {
    id: 'help1',
    type: 'help1',
  },
  {
    id: 'help2',
    type: 'help2',
  },
  {
    id: 'notifications',
    type: 'notifications',
  },
  {
    id: 'review',
    type: 'review',
  },
  {
    id: 'stats',
    type: 'stats',
  },
  {
    id: 'comparison',
    type: 'comparison',
  },
  {
    id: 'connect',
    type: 'connect',
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [instagramResult, setInstagramResult] = useState<Instagram | null>(null);
  const [trackResult, setTrackResult] = useState<Instagram | null>(null);
  const { showLogin, isLoggedIn, sync } = useInstagram();
  const { account } = useAccountContext();
  const { track } = useAnalytics();

  // Progress bar excludes the start step (step 0)
  const stepsWithProgress = STEPS.length - 1;
  const progressWidth = useSharedValue((1 / stepsWithProgress) * 100);
  const step = STEPS[currentStep];

  // When user successfully connects Instagram and account data is ready, start sync and complete onboarding
  useEffect(() => {
    if (isLoggedIn === true && step.type === 'connect' && account?.instagram_username) {
      track(Events.INSTAGRAM_CONNECTED_ONBOARDING, { connected: true });
      sync();
      onComplete();
    }
  }, [isLoggedIn, step.type, account?.instagram_username, sync, onComplete]);

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
    // Track HDYHAU completion when source step is completed
    if (step.id === 'source') {
      track(Events.HDYHAU_COMPLETED, { source: choiceId.toLowerCase() });
    }
    // Track HCWH completion when help_with step is completed
    if (step.id === 'help_with') {
      track(Events.HCWH_COMPLETED, { answer: choiceId.toLowerCase() });
    }
    setAnswers({ ...answers, [step.id]: choiceId });
    handleNext();
  };

  const handleUsernameNext = (username: string | null) => {
    if (username) {
      setAnswers({ ...answers, [step.id]: username });
    }
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
          <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <Animated.View className="h-full rounded-full bg-black" style={progressAnimatedStyle} />
          </View>
        </View>
      )}

      {/* Content */}
      <View className={`flex-1 ${isStartStep ? '' : 'pt-8'}`}>
        <Animated.View
          key={step.id}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          className="flex-1">
          {step.type === 'start' && <StartScreen onNext={handleNext} />}
          {step.type === 'choice' && (
            <ChoiceQuestion
              question={(step as ChoiceStep).question}
              choices={(step as ChoiceStep).choices}
              onSelect={handleSelect}
            />
          )}
          {step.type === 'username' && (
            <UsernameSearch
              onNext={handleUsernameNext}
              savedResult={instagramResult}
              onResultFetched={setInstagramResult}
            />
          )}
          {step.type === 'track' && (
            <TrackSearch
              onNext={handleUsernameNext}
              savedResult={trackResult}
              onResultFetched={setTrackResult}
            />
          )}
          {step.type === 'help1' && <HelpScreen1 onNext={handleNext} />}
          {step.type === 'help2' && <HelpScreen2 onNext={handleNext} />}
          {step.type === 'notifications' && <NotificationConsent onComplete={handleNext} />}
          {step.type === 'review' && <ReviewScreen onNext={handleNext} />}
          {step.type === 'stats' && <StatsScreen onNext={handleNext} />}
          {step.type === 'comparison' && <ComparisonScreen onNext={handleNext} />}
          {step.type === 'connect' && <ConnectScreen onConnect={showLogin} onSkip={onComplete} />}
        </Animated.View>
      </View>
    </View>
  );
}
