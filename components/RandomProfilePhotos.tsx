import { useEffect, useState, useCallback } from 'react';
import { View, Image, Dimensions } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const SCREEN_WIDTH = Dimensions.get('window').width;

interface ProfilePhoto {
  user_id: string;
  profile_pic_url: string;
}

interface RandomProfilePhotosProps {
  userId: string;
  count?: number;
  pollInterval?: number;
}

function AnimatedProfilePhoto({
  profile,
  index,
  isAnimatingOut,
  onAnimateOutComplete,
}: {
  profile: ProfilePhoto;
  index: number;
  isAnimatingOut: boolean;
  onAnimateOutComplete?: () => void;
}) {
  const translateX = useSharedValue(SCREEN_WIDTH);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Animate in with staggered delay - first photo arrives first, others follow and overlap
    const delay = index * 150;
    translateX.value = withDelay(
      delay,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) })
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
  }, []);

  useEffect(() => {
    if (isAnimatingOut) {
      // Animate out with staggered delay - first photo leaves first
      const delay = index * 100;
      translateX.value = withDelay(
        delay,
        withTiming(-SCREEN_WIDTH, { duration: 400, easing: Easing.in(Easing.ease) })
      );
      opacity.value = withDelay(
        delay,
        withTiming(0, { duration: 400 }, (finished) => {
          // Only call complete on the last photo
          if (finished && index === 2 && onAnimateOutComplete) {
            runOnJS(onAnimateOutComplete)();
          }
        })
      );
    }
  }, [isAnimatingOut]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  // Negative margin to create overlap effect, more overlap for later photos
  const overlapMargin = index > 0 ? -20 : 0;

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          marginLeft: overlapMargin,
          zIndex: 3 - index, // First photo on top
        },
      ]}>
      <Image
        source={{ uri: profile.profile_pic_url }}
        className="h-16 w-16 rounded-full border-2 border-white"
      />
    </Animated.View>
  );
}

export default function RandomProfilePhotos({
  userId,
  count = 3,
  pollInterval = 5000,
}: RandomProfilePhotosProps) {
  const db = useSQLiteContext();
  const [profiles, setProfiles] = useState<ProfilePhoto[]>([]);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [key, setKey] = useState(0);

  const fetchRandomProfiles = useCallback(async () => {
    try {
      const results = await db.getAllAsync<ProfilePhoto>(
        `SELECT DISTINCT i.user_id, i.profile_pic_url
         FROM instagrams i
         WHERE i.profile_pic_url IS NOT NULL
           AND i.user_id != ?
           AND (
             EXISTS (SELECT 1 FROM followers f WHERE f.follower_user_id = i.user_id AND f.tracked_account_id = ?)
             OR EXISTS (SELECT 1 FROM followings f WHERE f.followed_user_id = i.user_id AND f.tracked_account_id = ?)
           )
         ORDER BY RANDOM()
         LIMIT ?`,
        [userId, userId, userId, count]
      );
      return results;
    } catch (error) {
      console.log('Error fetching random profiles:', error);
      return [];
    }
  }, [db, userId, count]);

  const handleAnimateOutComplete = useCallback(() => {
    setIsAnimatingOut(false);
    fetchRandomProfiles().then((newProfiles) => {
      if (newProfiles.length > 0) {
        setProfiles(newProfiles);
        setKey((k) => k + 1);
      }
    });
  }, [fetchRandomProfiles]);

  const cycleProfiles = useCallback(async () => {
    if (profiles.length > 0) {
      // Trigger animate out
      setIsAnimatingOut(true);
    } else {
      // First load
      const newProfiles = await fetchRandomProfiles();
      if (newProfiles.length > 0) {
        setProfiles(newProfiles);
      }
    }
  }, [fetchRandomProfiles, profiles.length]);

  // Initial fetch
  useEffect(() => {
    cycleProfiles();
  }, []);

  // Polling interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isAnimatingOut) {
        setIsAnimatingOut(true);
      }
    }, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, isAnimatingOut]);

  if (profiles.length === 0) {
    return null;
  }

  return (
    <View className="mt-6 w-full items-center overflow-hidden">
      <View key={key} className="flex-row items-center justify-center">
        {profiles.map((profile, index) => (
          <AnimatedProfilePhoto
            key={profile.user_id}
            profile={profile}
            index={index}
            isAnimatingOut={isAnimatingOut}
            onAnimateOutComplete={index === profiles.length - 1 ? handleAnimateOutComplete : undefined}
          />
        ))}
      </View>
    </View>
  );
}
