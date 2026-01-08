import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { X, Search } from 'lucide-react-native';
import Circles from '~/assets/circles.svg';
import Logo from '~/assets/logo_black.svg';
import { useAccountList, AccountListType, getAccountListLabel } from '~/lib/useFollowerStats';
import { useInstagram } from '~/contexts/InstagramContext';
import AccountCard from './AccountCard';
import TextField from './TextField';

interface AccountsListProps {
  userId: string;
  type: AccountListType;
  isMainAccount: boolean;
}

export default function AccountsList({ userId, type, isMainAccount }: AccountsListProps) {
  const { data: accounts, isLoading } = useAccountList(userId ?? null, type ?? null);
  const { followUser, unfollowUser } = useInstagram();
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingAccountId, setLoadingAccountId] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());

  // Determine action type based on list type - only show actions for main account
  const actionType = isMainAccount
    ? type === 'notFollowingBack' ? 'unfollow' : type === 'notFollowedBack' ? 'follow' : null
    : null;

  const openInstagramProfile = (username: string) => {
    Linking.openURL(`https://instagram.com/${username}`);
  };

  const handleFollow = async (accountId: string, username: string, profilePicUrl: string | null) => {
    setLoadingAccountId(accountId);
    try {
      const result = await followUser({
        targetUserId: accountId,
        targetUsername: username,
        targetProfilePicUrl: profilePicUrl,
      });
      if (result.success) {
        setCompletedActions((prev) => new Set(prev).add(accountId));
      } else {
        Alert.alert('Error', result.error || 'Failed to follow user');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to follow user');
    } finally {
      setLoadingAccountId(null);
    }
  };

  const handleUnfollow = async (accountId: string, username: string) => {
    Alert.alert('Unfollow', `Unfollow @${username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: async () => {
          setLoadingAccountId(accountId);
          try {
            const result = await unfollowUser(accountId);
            if (result.success) {
              setCompletedActions((prev) => new Set(prev).add(accountId));
            } else {
              Alert.alert('Error', result.error || 'Failed to unfollow user');
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to unfollow user');
          } finally {
            setLoadingAccountId(null);
          }
        },
      },
    ]);
  };

  const title = type ? getAccountListLabel(type, isMainAccount) : '';

  const filteredAccounts = useMemo(() => {
    const sorted = [...accounts].sort((a, b) => a.username.localeCompare(b.username));
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter(
      (account) =>
        account.username.toLowerCase().includes(query) ||
        account.full_name?.toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  return (
    <View className="flex-1 bg-background">
      <View style={StyleSheet.absoluteFill} className="items-center justify-center">
        <Circles width={700} height={700} />
      </View>

      {/* Header */}
      <SafeAreaView>
        <View className="flex-row items-center justify-between px-4 pb-3">
          <View className="flex-1 items-center pt-6">
            <Logo width={160} height={30} />
          </View>
          <Pressable
            className="absolute right-4 p-2 active:opacity-70"
            onPress={() => router.back()}>
            <X size={24} color="#000000" />
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Content */}
      <View className="flex-1 p-4">
        <Text className="font-roboto-bold mb-4 text-2xl">{title}</Text>

        {/* Search Field */}
        <View className="mb-4">
          <TextField
            placeholder="Search"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            icon={<Search size={20} color="#9ca3af" />}
          />
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500">Loading...</Text>
          </View>
        ) : filteredAccounts.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500">No accounts found</Text>
          </View>
        ) : (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="gap-3 pb-8">
              {filteredAccounts.map((account) => {
                const isCompleted = completedActions.has(account.id);
                const isLoading = loadingAccountId === account.id;

                // Determine action props
                let actionProps = {};
                if (actionType === 'follow' && !isCompleted) {
                  actionProps = {
                    actionLabel: 'Follow',
                    actionVariant: 'primary' as const,
                    actionLoading: isLoading,
                    onAction: () => handleFollow(account.id, account.username, account.profile_pic_url),
                  };
                } else if (actionType === 'unfollow' && !isCompleted) {
                  actionProps = {
                    actionLabel: 'Unfollow',
                    actionVariant: 'secondary' as const,
                    actionLoading: isLoading,
                    onAction: () => handleUnfollow(account.id, account.username),
                  };
                } else if (isCompleted) {
                  actionProps = {
                    actionLabel: actionType === 'follow' ? 'Following' : 'Unfollowed',
                    actionVariant: 'secondary' as const,
                  };
                }

                return (
                  <AccountCard
                    key={account.id}
                    username={account.username}
                    fullName={account.full_name}
                    profilePicUrl={account.profile_pic_url}
                    onPress={() => openInstagramProfile(account.username)}
                    {...actionProps}
                  />
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
