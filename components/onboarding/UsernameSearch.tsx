import { useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Instagram } from '~/lib/types';
import { fetchPublicProfile } from '~/lib/fetchPublicProfile';
import InstagramCard from '~/components/InstagramCard';
import Button from '~/components/Button';
import TextField from '~/components/TextField';

const FAKE_ACCOUNTS = [
  {
    id: '1',
    username: 'sarah_designs',
    image: require('~/assets/profile_0.jpg'),
    time: '2 hours ago',
  },
  {
    id: '2',
    username: 'mike.travels',
    image: require('~/assets/profile_1.jpg'),
    time: '5 hours ago',
  },
  {
    id: '3',
    username: 'emma_fitness',
    image: require('~/assets/profile_2.jpg'),
    time: 'Yesterday',
  },
];

interface UsernameSearchProps {
  onNext: (username: string | null) => void;
  savedResult: Instagram | null;
  onResultFetched: (result: Instagram) => void;
}

export default function UsernameSearch({
  onNext,
  savedResult,
  onResultFetched,
}: UsernameSearchProps) {
  const [username, setUsername] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  // If we have a saved result, show the result view
  if (savedResult) {
    return (
      <View className="flex-1 px-4">
        <Text className="mb-8 text-center font-roboto-black text-3xl">What we found</Text>

        <InstagramCard account={savedResult} />

        <Text className="mb-3 mt-6 font-roboto-medium text-lg text-black">Recent activity</Text>

        <View className="gap-3">
          {FAKE_ACCOUNTS.map((account) => (
            <View key={account.id} className="overflow-hidden rounded-2xl">
              <View className="flex-row items-center gap-3 bg-white p-4">
                <Image source={account.image} className="h-12 w-12 rounded-full" blurRadius={8} />
                <View className="flex-1 justify-center">
                  <View className="mb-1 h-4 w-32 rounded bg-gray-300" />
                  <Text className="font-roboto text-sm text-gray-400">{account.time}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View className="mt-8">
          <Button label="Continue" onPress={() => onNext(savedResult.username)} />
        </View>
      </View>
    );
  }

  const handleContinue = async () => {
    if (!username.trim()) return;

    setIsSearching(true);
    setError('');

    try {
      const profile = await fetchPublicProfile(username);
      onResultFetched(profile);
    } catch (err) {
      setError('Could not find this account. Please check the username.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <View className="flex-1 px-4">
      <Text className="mb-8 text-center font-roboto-black text-3xl">What's your IG username?</Text>

      <TextField
        placeholder="Instagram username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        error={error}
      />

      <View className="mt-6">
        <Button
          label="Continue"
          loading={isSearching}
          onPress={handleContinue}
          disabled={!username.trim()}
        />
      </View>

      <Pressable className="mt-4 py-3" onPress={() => onNext(null)}>
        <Text className="text-center font-roboto-medium text-base text-black">Skip</Text>
      </Pressable>
    </View>
  );
}
