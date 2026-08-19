import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
  Image,
} from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Unhinged from '~/assets/unhinged_2.svg';
import Button from '~/components/Button';
import TextField from '~/components/TextField';
import { useInstagram } from '~/contexts/InstagramContext';
import { useAccountContext } from '~/contexts/AccountContext';

interface SearchableAccount {
  user_id: string;
  username: string;
  full_name: string | null;
  profile_pic_url: string | null;
}

interface StartTrackingProps {
  onContinue: (username: string) => void;
  isLoading: boolean;
  error: string;
}

export default function StartTracking({ onContinue, isLoading, error }: StartTrackingProps) {
  const [username, setUsername] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [hasSelected, setHasSelected] = useState(false);
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const { userId } = useInstagram();
  const { trackedInstagrams } = useAccountContext();

  const svgOpacity = useSharedValue(1);
  const svgScale = useSharedValue(1);
  const svgMarginTop = useSharedValue(0);

  // Fetch all accounts the user follows (for suggestions)
  const { data: followingAccounts = [] } = useQuery<SearchableAccount[]>({
    queryKey: ['searchableAccounts', userId],
    queryFn: async () => {
      if (!userId) return [];
      const results = await db.getAllAsync<SearchableAccount>(
        `SELECT DISTINCT i.user_id, i.username, i.full_name, i.profile_pic_url
         FROM instagrams i
         INNER JOIN followings f ON f.followed_user_id = i.user_id
         WHERE f.tracked_account_id = ?
           AND f.ended_at IS NULL
           AND i.user_id != ?
         ORDER BY i.username`,
        [userId, userId]
      );
      return results;
    },
    enabled: !!userId,
  });

  // Filter suggestions based on input, excluding already tracked accounts
  const trackedUserIds = useMemo(
    () => new Set(trackedInstagrams.map((t) => t.user_id)),
    [trackedInstagrams]
  );

  const suggestions = useMemo(() => {
    if (!username.trim() || hasSelected) return [];
    const query = username.toLowerCase();
    return followingAccounts
      .filter(
        (account) =>
          !trackedUserIds.has(account.user_id) &&
          (account.username.toLowerCase().includes(query) ||
            account.full_name?.toLowerCase().includes(query))
      )
      .slice(0, 4);
  }, [username, followingAccounts, trackedUserIds, hasSelected]);

  const handleSelectSuggestion = (selectedUsername: string) => {
    setHasSelected(true);
    setUsername(selectedUsername);
  };

  const handleUsernameChange = (text: string) => {
    setHasSelected(false);
    setUsername(text);
  };

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setIsKeyboardVisible(true);
        svgOpacity.value = withTiming(0, { duration: 250 });
        svgScale.value = withTiming(0.8, { duration: 250 });
        svgMarginTop.value = withTiming(-220, { duration: 250 });
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
        svgOpacity.value = withTiming(1, { duration: 250 });
        svgScale.value = withTiming(1, { duration: 250 });
        svgMarginTop.value = withTiming(0, { duration: 250 });
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  const svgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: svgOpacity.value,
    marginTop: svgMarginTop.value,
    transform: [{ scale: svgScale.value }],
  }));

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1">
      <View
        className={`flex-1 items-center p-4 ${isKeyboardVisible ? 'justify-start pt-24' : 'justify-center'}`}>
        <Animated.View style={svgAnimatedStyle} className="items-center">
          <Unhinged width={120} height={120} />
        </Animated.View>
        <Text className="mt-6 px-2 text-center font-roboto-extrablack text-4xl tracking-tighter">
          {t('startTracking.title')}
        </Text>
        <View className="relative mt-8 w-full">
          <TextField
            placeholder={t('startTracking.usernamePlaceholder')}
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
          />
          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <View className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-2xl bg-white shadow-lg">
              {suggestions.map((account, index) => (
                <Pressable
                  key={account.user_id}
                  className={`flex-row items-center gap-3 px-4 py-3 active:bg-gray-100 ${
                    index < suggestions.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                  onPress={() => handleSelectSuggestion(account.username)}>
                  {account.profile_pic_url ? (
                    <Image
                      source={{ uri: account.profile_pic_url }}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <View className="h-10 w-10 rounded-full bg-gray-200" />
                  )}
                  <View className="flex-1">
                    <Text className="font-roboto-medium text-base text-gray-900">
                      @{account.username}
                    </Text>
                    {account.full_name && (
                      <Text className="font-roboto-regular text-sm text-gray-500" numberOfLines={1}>
                        {account.full_name}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <Text className="font-roboto-regular mt-4 px-2 text-center text-sm text-gray-600">
          {t('startTracking.note')}
        </Text>
        <View className="mt-6 w-full">
          <Button
            label={t('startTracking.continue')}
            mode="next"
            loading={isLoading}
            onPress={() => onContinue(username)}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
