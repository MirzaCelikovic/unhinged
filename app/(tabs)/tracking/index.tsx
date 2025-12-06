import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert, StyleSheet } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useAccountContext } from '~/contexts/AccountContext';
import { useInstagram } from '~/contexts/InstagramContext';
import { useTracks, useAddTrack } from '~/lib/useTracks';
import { ChevronRight, Plus } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import NotTracking from '~/components/NotTracking';

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
      const result = await fetchUserId(username);

      // Check if account is accessible (either public or we follow them)
      if (result.isPrivate && !result.followedByViewer) {
        Alert.alert('Error', 'This account is private and you don\'t follow them. Please follow them first or choose a public account.');
        return;
      }

      await addTrack.mutateAsync({
        accountId: account.uuid,
        userId: result.userId,
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
    <View className="bg-gray-100 rounded-2xl p-4 gap-3">
      <TextInput
        className="bg-white border border-gray-300 rounded-lg p-3 text-base"
        placeholder="Instagram Username"
        value={newUsername}
        onChangeText={setNewUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View className="flex-row gap-2">
        <Pressable
          className="flex-1 bg-white py-3 rounded-lg active:opacity-70"
          onPress={() => {
            setShowAddForm(false);
            setNewUsername('');
          }}
          disabled={isFetchingUserId || addTrack.isPending}>
          <Text className="text-center font-semibold text-gray-900">Cancel</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-blue-500 py-3 rounded-lg active:bg-blue-600"
          onPress={handleAddTrack}
          disabled={isFetchingUserId || addTrack.isPending}>
          {isFetchingUserId || addTrack.isPending ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-center font-semibold text-white">Add Account</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <View style={StyleSheet.absoluteFill} className="items-center justify-center">
          <Circles width={700} height={700} />
        </View>
        <ActivityIndicator size="large" color="#6b7280" />
      </View>
    );
  }

  // Empty state
  if (tracks.length === 0) {
    return <NotTracking />;
  }

  // List with accounts
  return (
    <View className="bg-background flex-1">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>
      <ScrollView className="flex-1">
        <View className="p-4 pt-32">
        <Text className="text-base font-medium text-gray-500 uppercase mb-3">Tracked Accounts</Text>

        <View className="gap-3">
          {tracks.map((item) => (
            <Pressable
              key={item.user_id}
              className="bg-gray-100 rounded-2xl p-4 flex-row items-center justify-between active:bg-gray-200"
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/tracking/account',
                  params: { userId: item.user_id, username: item.username },
                })
              }>
              <Text className="text-lg font-semibold text-gray-900">@{item.username}</Text>
              <ChevronRight size={20} color="#9ca3af" />
            </Pressable>
          ))}

          {showAddForm ? (
            renderAddForm()
          ) : (
            <Pressable
              className="bg-gray-100 rounded-2xl p-4 flex-row items-center justify-center gap-2 active:bg-gray-200"
              onPress={() => setShowAddForm(true)}>
              <Plus size={20} color="#6b7280" />
              <Text className="text-lg font-semibold text-gray-900">Add Account</Text>
            </Pressable>
          )}
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

