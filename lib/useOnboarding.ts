import { useStorage } from './useStorage';

const ONBOARDING_KEY = 'onboarding_completed';

export function useOnboarding() {
  const [[isLoading, value], setValue] = useStorage(ONBOARDING_KEY);

  const isOnboarded = value === 'true';

  const completeOnboarding = () => {
    setValue('true');
  };

  const resetOnboarding = () => {
    setValue(null);
  };

  return {
    isLoading,
    isOnboarded,
    completeOnboarding,
    resetOnboarding,
  };
}
