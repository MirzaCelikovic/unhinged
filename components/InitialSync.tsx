import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import { Circle, CircleCheck } from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Unhinged from '~/assets/unhinged.svg';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram } from '~/contexts/InstagramContext';
import { useAddTrackedInstagram } from '~/lib/useInstagram';

interface InitialSyncProps {
  userId: string;
  username: string;
  onComplete: () => void;
  isMainAccount?: boolean;
}

type SyncStepState = 'waiting' | 'active' | 'completed';

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
    } else {
      progressX.value = 0;
      progressWidth.value = 0;
    }
  }, [state]);

  const progressAnimatedStyle = useAnimatedStyle(() => {
    // Calculate position so bar slides smoothly across and reappears from left
    const barWidth = progressWidth.value;
    const position = progressX.value * (1 + barWidth) - barWidth;

    return {
      position: state === 'completed' ? 'relative' : 'absolute',
      left: state === 'completed' ? 0 : `${position * 100}%`,
      width: `${barWidth * 100}%`,
      height: '100%',
    };
  });

  return (
    <View className="rounded-3xl bg-white p-6">
      {/* Step label and checkmark */}
      <View className="flex-row items-center justify-between">
        <Text className="font-roboto-medium text-lg text-black">{label}</Text>
        {state === 'completed' ? (
          <CircleCheck size={24} color="#000000" />
        ) : (
          <Circle size={24} color="#9ca3af" />
        )}
      </View>

      {/* Progress bar */}
      <View className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
        <Animated.View style={progressAnimatedStyle} className="rounded-full bg-black" />
      </View>
    </View>
  );
}

export default function InitialSync({ userId, username, onComplete, isMainAccount = false }: InitialSyncProps) {
  const [step1, setStep1] = useState<SyncStepState>('active');
  const [step2, setStep2] = useState<SyncStepState>('waiting');
  const [step3, setStep3] = useState<SyncStepState>('waiting');
  const { account } = useAccountContext();
  const { fetchAccountMetadata, syncUser } = useInstagram();
  const addTrackedInstagram = useAddTrackedInstagram();

  useEffect(() => {
    const runSync = async () => {
      if (!account?.uuid) return;

      try {
        // Step 1: Save account in backend and fetch metadata
        setStep1('active');

        if (!isMainAccount) {
          // For tracked accounts: add to tracks
          console.log('📝 Adding track for:', username);
          await addTrackedInstagram.mutateAsync({
            accountId: account.uuid,
            userId: userId,
            username: username,
          });
          console.log('✅ Track added');
        }
        // Note: For main account, it's already connected via LOGIN_SUCCESS handler

        // Fetch account metadata (bio, media count)
        console.log('📡 Fetching metadata for:', username);
        await fetchAccountMetadata(username);
        console.log('✅ Metadata fetched');
        // Add 2s delay for UX
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log('✅ Step 1 completed');
        setStep1('completed');

        // Step 2: Fetch following and followers from Instagram
        setStep2('active');
        await syncUser(userId);
        setStep2('completed');

        // Step 3: Save to database and analyze
        setStep3('active');
        // Database saving happens automatically via sync handlers
        // Add delay for UX
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setStep3('completed');

        // All done - call completion callback
        onComplete();
      } catch (error) {
        console.error('Sync error:', error);
        // TODO: Handle error
      }
    };

    runSync();
  }, [userId, username]);

  return (
    <View className="flex-1 items-center justify-center p-4">
      <Unhinged width={120} height={120} />
      <Text className="font-roboto-extrablack mt-6 px-12 text-center text-4xl tracking-tighter">
        Syncing...
      </Text>
      <Text className="font-roboto-regular mt-6 px-12 text-center text-lg tracking-tighter">
        This might take a minute depending on number of followers.
      </Text>

      {/* Sync Progress */}
      <View className="mt-8 w-full gap-4">
        <SyncStep label="Fetching profile" state={step1} />
        <SyncStep label="Syncing with Instagram" state={step2} />
        <SyncStep label="Analyzing followers" state={step3} />
      </View>
    </View>
  );
}
