import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram } from '~/contexts/InstagramContext';
import { useTracks, useAddTrack } from '~/lib/useTracks';

export default function Tracking() {
  const { account } = useAccountContext();
  const { fetchUserId } = useInstagram();
  const { data: tracks = [], isLoading } = useTracks(account?.uuid || null);
  const addTrack = useAddTrack();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [isFetchingUserId, setIsFetchingUserId] = useState(false);

  const handleAddTrack = async () => {
    if (!account?.uuid || !newUsername.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    const username = newUsername.trim();

    try {
      setIsFetchingUserId(true);
      const userId = await fetchUserId(username);

      await addTrack.mutateAsync({
        accountId: account.uuid,
        userId: userId,
        username: username,
      });

      setNewUsername('');
      setShowAddForm(false);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to add track');
    } finally {
      setIsFetchingUserId(false);
    }
  };


  const renderAddForm = () => (
    <View className="w-full items-center gap-3 px-8">
      <TextInput
        className="w-full border border-gray-300 rounded-lg p-3"
        placeholder="Instagram Username"
        value={newUsername}
        onChangeText={setNewUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View className="w-full flex-row gap-2">
        <Pressable
          className="flex-1 bg-gray-300 py-3 rounded-lg active:opacity-70"
          onPress={() => {
            setShowAddForm(false);
            setNewUsername('');
          }}
          disabled={isFetchingUserId || addTrack.isPending}>
          <Text className="text-center font-semibold">Cancel</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-blue-500 py-3 rounded-lg active:opacity-70"
          onPress={handleAddTrack}
          disabled={isFetchingUserId || addTrack.isPending}>
          {isFetchingUserId || addTrack.isPending ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-center font-semibold text-white">Continue</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6b7280" />
      </View>
    );
  }

  // Empty state with centered button/form
  if (tracks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        {showAddForm ? (
          renderAddForm()
        ) : (
          <Pressable
            className="bg-blue-500 px-6 py-3 rounded-lg active:opacity-70"
            onPress={() => setShowAddForm(true)}>
            <Text className="text-white text-lg font-semibold">Start tracking</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // List with accounts
  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.user_id}
        contentContainerClassName="pt-16"
        renderItem={({ item }) => (
          <Pressable
            className="border-b border-gray-100 p-4 active:bg-gray-50"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/tracking/account',
                params: { userId: item.user_id, username: item.username },
              })
            }>
            <Text className="text-base font-semibold">@{item.username}</Text>
            <Text className="text-sm text-gray-500">{item.user_id}</Text>
          </Pressable>
        )}
        ListFooterComponent={
          showAddForm ? (
            renderAddForm()
          ) : (
            <View className="p-4">
              <Pressable
                className="bg-gray-300 py-3 rounded-lg active:opacity-70"
                onPress={() => setShowAddForm(true)}>
                <Text className="text-center font-semibold">Add account</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}

