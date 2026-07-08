import { View, Text } from 'react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, CircleCheck, CircleX } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Unhinged from '~/assets/unhinged.svg';
import { useInstagram, SyncStepStatus } from '~/contexts/InstagramContext';
import RandomProfilePhotos from '~/components/RandomProfilePhotos';

type SyncStepState = 'waiting' | 'active' | 'completed' | 'error';

interface SyncStepProps {
  label: string;
  state: SyncStepState;
}

function SyncStep({ label, state }: SyncStepProps) {
  const progressX = useSharedValue(0);
  const progressWidth = useSharedValue(0.3);

  useEffect(() => {
    if (state === 'active') {
      // Animate progress bar sliding back and forth
      progressX.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );

      progressWidth.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else if (state === 'completed') {
      progressX.value = withTiming(0, { duration: 200 });
      progressWidth.value = withTiming(1, { duration: 200 });
    } else if (state === 'error') {
      progressX.value = withTiming(0, { duration: 200 });
      progressWidth.value = withTiming(1, { duration: 200 });
    } else {
      progressX.value = 0;
      progressWidth.value = 0;
    }
  }, [state]);

  const progressAnimatedStyle = useAnimatedStyle(() => {
    const barWidth = progressWidth.value;
    const position = progressX.value * (1 + barWidth) - barWidth;

    return {
      position: state === 'completed' || state === 'error' ? 'relative' : 'absolute',
      left: state === 'completed' || state === 'error' ? 0 : `${position * 100}%`,
      width: `${barWidth * 100}%`,
      height: '100%',
    };
  });

  return (
    <View className="rounded-3xl bg-white p-6">
      <View className="flex-row items-center justify-between">
        <Text className="font-roboto-medium text-lg text-black">{label}</Text>
        {state === 'completed' ? (
          <CircleCheck size={24} color="#000000" />
        ) : state === 'error' ? (
          <CircleX size={24} color="#ef4444" />
        ) : (
          <Circle size={24} color="#9ca3af" />
        )}
      </View>

      <View className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
        <Animated.View
          style={progressAnimatedStyle}
          className={`rounded-full ${state === 'error' ? 'bg-red-500' : 'bg-black'}`}
        />
      </View>
    </View>
  );
}

// Helper to convert SyncStepStatus to SyncStepState
function toStepState(status: SyncStepStatus): SyncStepState {
  switch (status) {
    case 'pending':
      return 'waiting';
    case 'syncing':
      return 'active';
    case 'complete':
      return 'completed';
    case 'error':
      return 'error';
  }
}

// Helper to get combined step state from multiple statuses
function getCombinedState(statuses: SyncStepStatus[]): SyncStepState {
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.every((s) => s === 'complete')) return 'completed';
  if (statuses.some((s) => s === 'syncing')) return 'active';
  return 'waiting';
}

interface TrackedAccountSyncProps {
  userId: string;
  username: string;
}

export default function TrackedAccountSync({ userId, username }: TrackedAccountSyncProps) {
  const { t } = useTranslation();
  const { syncState } = useInstagram();

  // Find this specific tracked account in syncState
  const trackedAccount = syncState.trackedAccounts.find((acc) => acc.userId === userId);

  // Derive step states from tracked account status
  const followingDisabled = trackedAccount?.followingDisabled;
  const followersDisabled = trackedAccount?.followersDisabled;

  // Step 1: Metadata fetching
  const step1State = trackedAccount ? toStepState(trackedAccount.metadata) : 'waiting';

  // Step 2: Following + Followers syncing (only include active syncs)
  const activeSyncSteps = [
    ...(!followingDisabled && trackedAccount ? [trackedAccount.following] : []),
    ...(!followersDisabled && trackedAccount ? [trackedAccount.followers] : []),
  ] as SyncStepStatus[];
  const step2State = activeSyncSteps.length > 0 ? getCombinedState(activeSyncSteps) : 'completed' as SyncStepState;

  // Step 3: Analyzing (complete when everything is done)
  const step3State =
    trackedAccount &&
    trackedAccount.metadata === 'complete' &&
    trackedAccount.following === 'complete' &&
    trackedAccount.followers === 'complete'
      ? 'completed'
      : step2State === 'completed'
        ? 'active'
        : 'waiting';

  // Dynamic labels based on what's being synced
  const step2Label =
    followingDisabled && followersDisabled
      ? t('components.trackedAccountSync.step2SyncingInstagram')
      : followersDisabled
        ? t('components.trackedAccountSync.step2SyncingFollowing')
        : followingDisabled
          ? t('components.trackedAccountSync.step2SyncingFollowers')
          : t('components.trackedAccountSync.step2SyncingInstagram');

  return (
    <View className="flex-1 items-center justify-center p-4">
      <Unhinged width={110} height={110} />
      <Text className="mt-4 px-12 text-center font-roboto-extrablack text-4xl tracking-tighter">
        {t('components.trackedAccountSync.title', { username })}
      </Text>
      <Text className="mt-4 px-12 text-center font-roboto-regular text-lg tracking-tighter">
        {followingDisabled && followersDisabled
          ? t('components.trackedAccountSync.subtitleFetchingProfile')
          : t('components.trackedAccountSync.subtitleMayTakeMinute')}
      </Text>

      <View className="mt-6 w-full gap-4">
        <SyncStep label={t('components.trackedAccountSync.stepFetchingProfile')} state={step1State} />
        {(!followingDisabled || !followersDisabled) && (
          <SyncStep label={step2Label} state={step2State} />
        )}
        <SyncStep label={t('components.trackedAccountSync.stepAnalyzing')} state={step3State} />
      </View>

      <RandomProfilePhotos userId={userId} />
    </View>
  );
}
