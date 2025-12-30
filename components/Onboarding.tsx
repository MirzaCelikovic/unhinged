import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { CircleChevronLeft } from 'lucide-react-native';
import ChoiceQuestion from '~/components/onboarding/ChoiceQuestion';
import UsernameSearch from '~/components/onboarding/UsernameSearch';
import TrackSearch from '~/components/onboarding/TrackSearch';
import HelpScreen1 from '~/components/onboarding/HelpScreen1';
import HelpScreen2 from '~/components/onboarding/HelpScreen2';
import NotificationConsent from '~/components/onboarding/NotificationConsent';
import Logo from '~/assets/logo_black.svg';
import { Instagram } from '~/lib/types';

interface OnboardingProps {
  onBack: () => void;
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

type Step = ChoiceStep | UsernameStep | TrackStep | HelpStep | NotificationsStep;

const STEPS: Step[] = [
  {
    id: 'source',
    type: 'choice',
    question: 'How did you find us?',
    choices: [
      { id: 'friends', label: 'Friends' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'facebook', label: 'Facebook' },
      { id: 'google', label: 'Google' },
      { id: 'other', label: 'Other' },
    ],
  },
  {
    id: 'username',
    type: 'username',
  },
  {
    id: 'help_with',
    type: 'choice',
    question: 'What can Unhinged help you with?',
    choices: [
      { id: 'track', label: 'Track users privately' },
      { id: 'not_following_back', label: "See who's not following you back" },
      { id: 'stories', label: 'View stories anonymously' },
      { id: 'red_flags', label: 'Generate red flag reports' },
      { id: 'wrapped', label: 'See your IG wrapped' },
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
];

export default function Onboarding({ onBack, onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [instagramResult, setInstagramResult] = useState<Instagram | null>(null);
  const [trackResult, setTrackResult] = useState<Instagram | null>(null);

  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const step = STEPS[currentStep];

  const handleBack = () => {
    if (currentStep === 0) {
      onBack();
    } else {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep === STEPS.length - 1) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSelect = (choiceId: string) => {
    setAnswers({ ...answers, [step.id]: choiceId });
    handleNext();
  };

  const handleUsernameNext = (username: string | null) => {
    if (username) {
      setAnswers({ ...answers, [step.id]: username });
    }
    handleNext();
  };

  return (
    <View className="flex-1">
      {/* Header with back button, logo, and progress bar */}
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
          <View className="h-full rounded-full bg-black" style={{ width: `${progress}%` }} />
        </View>
      </View>

      {/* Content */}
      <View className="flex-1 pt-8">
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
        {step.type === 'notifications' && (
          <NotificationConsent onComplete={onComplete} />
        )}
      </View>
    </View>
  );
}
